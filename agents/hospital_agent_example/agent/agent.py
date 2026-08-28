"""Enhanced doctor agent inspired by MMedAgent-RL multi-agent architecture.

Architecture:
1. Structured Case State (tree-like memory) — symptoms, history, exam results by category
2. Triage Doctor — identify likely department(s) from initial presentation
3. Information Gap Analyzer — determine what information is still missing
4. Specialist Consultation — multiple perspectives on diagnosis
5. Attending Physician — final reconciled diagnosis and treatment
6. Independent Safety Check — verify treatment safety

Key optimizations:
- Information-gain-guided questioning (ask what matters for current differential)
- Constrained outputs to standard names
- Token-efficient by minimizing redundant questions
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Iterable
from datetime import datetime, timezone
import time as time_module
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from hospital_agent_sdk import AgentBuilder, BasicAgent, load_config
from .memory import build_memory
from .skills_retriever import MedicalSkillManager
from .prompt import (
    DEPARTMENT_PROMPT,
    DISEASE_AND_TREATMENT_PROMPT,
    DOCTOR_SYSTEM_PROMPT,
    EVALUATION_REFLECTION_PROMPT,
    EXAM_CATEGORY_PROMPT,
    EXAM_ITEM_PROMPT,
    JSON_REPAIR_SYSTEM_PROMPT,
    NEXT_ACTION_PROMPT,
    format_prompt,
    # New prompts
    TRIAGE_PROMPT,
    INFO_GAP_PROMPT,
    SPECIALIST_CONSULT_PROMPT,
    ATTENDING_PHYSICIAN_PROMPT,
    SAFETY_REVIEW_PROMPT,
)

BASE_DIR = Path(__file__).resolve().parents[1]
REF_DATA_DIR = BASE_DIR / "data" / "ref_data"

# Configuration
MAX_QUESTIONS = 6  # Hard limit on conversation rounds (token efficiency)
MAX_EXAM_CATEGORIES = 3  # Max exam categories to query
MAX_EXAMS_PER_ORDER = 3  # Max exams per order call


class MyDoctorAgent(BasicAgent):
    """Enhanced doctor agent with structured state and multi-agent reasoning."""

    def __init__(self, config: Optional[Dict[str, Any]] = None, memory: Any = None):
        super().__init__(config=config, memory=memory)
        self._current_mode = "train"  # Default to train, overwritten before each case

        # Standard catalogs
        self.examination_catalog = load_examination_catalog()
        self.disease_catalog = load_disease_catalog()
        self.exam_categories = list(self.examination_catalog.keys())
        self.departments = list(self.disease_catalog.keys())
        self.exam_category_map = build_name_map(self.exam_categories)
        self.department_map = build_name_map(self.departments)

        # Precompute all diseases for global lookup
        self.all_diseases = []
        for dept, names in self.disease_catalog.items():
            self.all_diseases.extend(names)
        self.disease_to_dept = {}
        for dept, names in self.disease_catalog.items():
            for name in names:
                self.disease_to_dept[normalize_name(name)] = dept

        # Initialize Skills knowledge base
        try:
            skills_dir = str(BASE_DIR / "data" / "skills")
            self.skills_manager = MedicalSkillManager(skills_dir=skills_dir)
            print(f"✅ Skills 知识库加载成功: {len(self.skills_manager.skills)} 个疾病")
        except Exception as e:
            print(f"⚠️ Skills 知识库加载失败: {e}")
            self.skills_manager = None

    async def train(self, patient_id: str) -> Dict[str, Any]:
        self._current_mode = "train"
        return await self._run_agent(patient_id=patient_id, mode="train")

    async def test(self, patient_id: str) -> Dict[str, Any]:
        self._current_mode = "test"
        # Test/evaluation mode: do NOT send api_key to the contest service.
        # The evaluation platform provides the model for patient simulation.
        return await self._run_agent(patient_id=patient_id, mode="test")

    async def _run_agent(self, patient_id: str, mode: str) -> Dict[str, Any]:
        memory_notes = self.memory.load_notes() if self.memory and hasattr(self.memory, "load_notes") else []

        # ============================================================
        # Structured Case State (tree-like, inspired by AgentMental)
        # ============================================================
        case_state: Dict[str, Any] = {
            "patient_id": patient_id,
            "mode": mode,
            "memory_notes": memory_notes,
            "chat_history": [],
            "chief_complaint": "",        # 主诉
            "present_illness": "",        # 现病史
            "past_history": "",           # 既往史
            "vitals": {},                 # 生命体征等
            "symptoms": {},               # 症状: {symptom: {status, details}}
            "exposures": {},              # 暴露/接触史
            "family_history": "",
            "ordered_examinations": [],
            "invalid_examinations": [],
            "examination_results": {},    # {exam_name: {result, status}}
            "exam_decision_trace": [],
            "decision_trace": [],
            "differential_diagnosis": [], # 鉴别诊断列表
            "top_department": "",
            "candidate_departments": [],
            "question_count": 0,
            "final_plan": None,
        }

        # ============================================================
        # PHASE 1: Initial Triage — understand presentation, identify department
        # ============================================================
        await self._initial_triage(case_state, patient_id)

        # ============================================================
        # PHASE 2: Information-gap-driven Interview Loop
        # ============================================================
        await self._interview_loop(case_state, patient_id)

        # ============================================================
        # PHASE 3: Examination Strategy
        # ============================================================
        await self._examination_phase(case_state, patient_id)

        # ============================================================
        # PHASE 4: Multi-specialist Consultation + Final Decision
        # ============================================================
        final_result = await self._specialist_consult_and_decide(case_state, patient_id, mode)

        # ============================================================
        # PHASE 5: Training reflection
        # ============================================================
        evaluation_report = None
        evaluation_reflection = None
        if mode == "train":
            await self._rate_limit()
            evaluation_report = await self.actions.evaluation(
                patient_id=patient_id,
                final_result=final_result,
            )
            case_state["evaluation_report"] = evaluation_report

            reflection_prompt = format_prompt(
                EVALUATION_REFLECTION_PROMPT,
                {
                    "chat_history": case_state.get("chat_history", []),
                    "evaluation_details": self._evaluation_details(evaluation_report or {}),
                },
            )
            evaluation_reflection = await self._call_llm(
                prompt=reflection_prompt,
                default={"reflection": {"profile": "", "future_strategy": ""}},
                prompt_name="evaluation_reflection",
                patient_id=patient_id,
            )
            case_state["evaluation_reflection"] = evaluation_reflection

        if mode == "train" and self.memory:
            self.memory.append_case_reflection(
                patient_id=patient_id,
                evaluation_reflection=evaluation_reflection,
            )

        return final_result

    # ================================================================
    # PHASE 1: Initial Triage
    # ================================================================
    async def _safe_ask_patient(self, case_state: Dict[str, Any], patient_id: str, question: str, max_retries: int = 3) -> str:
        """Safely ask patient with error handling for content security issues.
        
        If a 555 error occurs (content security), try modifying the question
        or skip to the next question.
        """
        for attempt in range(max_retries):
            try:
                await self._rate_limit()
                answer = await self.actions.ask_patient(
                    patient_id,
                    {
                        "question": question,
                        "chat_history": case_state["chat_history"],
                    },
                )
                return answer
            except Exception as e:
                error_msg = str(e)
                if "555" in error_msg and "security" in error_msg.lower():
                    print(f"  [安全审查] 问题被拒绝: {question[:50]}... 尝试修改后重试")
                    # Modify the question to be more neutral
                    if attempt == 0:
                        question = "请描述您最近的身体不适情况，包括持续时间、主要表现和严重程度。"
                    elif attempt == 1:
                        question = "请问您最近有什么不舒服的地方吗？"
                    else:
                        print(f"  [安全审查] 多次尝试失败，跳过此患者")
                        raise
                elif "429" in error_msg:
                    print(f"  [限流] 等待后重试...")
                    await asyncio.sleep(10 * (attempt + 1))
                else:
                    # Other errors - retry once then give up
                    if attempt < max_retries - 1:
                        await asyncio.sleep(5)
                    else:
                        raise
        raise Exception("ask_patient failed after retries")

    async def _initial_triage(self, case_state: Dict[str, Any], patient_id: str) -> None:
        """Ask initial open question, then identify likely departments."""
        # First question: open-ended chief complaint
        answer = await self._safe_ask_patient(
            case_state,
            patient_id,
            "请详细描述这次最主要的不适：包括什么时候开始的、具体有什么症状、有多严重、以及是否伴随其他不适？",
        )
        case_state["chat_history"].append({"from": "doctor", "text": "请详细描述这次最主要的不适：包括什么时候开始的、具体有什么症状、有多严重、以及是否伴随其他不适？"})
        case_state["chat_history"].append({"from": "patient", "text": answer})
        case_state["chief_complaint"] = answer
        case_state["question_count"] = 1

        # Triage: identify most likely department(s)
        triage_prompt = format_prompt(
            TRIAGE_PROMPT,
            {
                "memory_notes": case_state["memory_notes"],
                "chief_complaint": answer,
                "departments": self.departments,
            },
        )
        triage_decision = await self._call_llm(
            prompt=triage_prompt,
            default={"department": self.departments[0] if self.departments else "", "reason": "", "alternative_departments": []},
            prompt_name="triage",
            patient_id=patient_id,
        )

        top_dept = match_standard_name(triage_decision.get("department"), self.department_map)
        if not top_dept:
            top_dept = self.departments[0] if self.departments else ""

        alt_depts = []
        for alt in as_text_list(triage_decision.get("alternative_departments")):
            matched = match_standard_name(alt, self.department_map)
            if matched and matched != top_dept and matched not in alt_depts:
                alt_depts.append(matched)

        # Add heuristic departments based on chief complaint keywords
        # This helps catch cross-department cases (e.g., skin issues might be 皮肤科/儿科/免疫科/感染科)
        heuristic_depts = self._heuristic_departments(case_state["chief_complaint"])
        for dept in heuristic_depts:
            if dept not in alt_depts and dept != top_dept:
                alt_depts.append(dept)

        case_state["top_department"] = top_dept
        case_state["candidate_departments"] = [top_dept] + alt_depts[:3]

        # Initialize differential with diseases from ALL candidate departments
        case_state["differential_diagnosis"] = []
        for dept in case_state["candidate_departments"]:
            case_state["differential_diagnosis"].extend(self.disease_catalog.get(dept, [])[:10])
        case_state["differential_diagnosis"] = case_state["differential_diagnosis"][:15]

        case_state["decision_trace"].append({
            "action": "triage",
            "top_department": top_dept,
            "alternative_departments": alt_depts[:2],
            "reason": clean_text(triage_decision.get("reason")),
        })

    # ================================================================
    # PHASE 2: Information-gap-driven Interview
    # ================================================================
    async def _interview_loop(self, case_state: Dict[str, Any], patient_id: str) -> None:
        """Ask targeted questions based on current information gaps.

        Instead of generic questions, this uses the current differential
        diagnosis to identify what specific information would help
        discriminate between candidate diseases.
        """
        # Keep the configured maximum (5 rounds) in both modes
        # This gives enough info for accurate diagnosis
        max_questions = int(self.config.get("max_questions", MAX_QUESTIONS))

        while case_state["question_count"] < max_questions:
            # In test mode, only run info_gap every 2 rounds to save time
            if case_state.get("mode") == "test" and case_state["question_count"] % 2 == 0:
                # Skip info_gap analysis - use simple heuristic instead
                gap_analysis = {
                    "needs_more_info": True,
                    "next_question": "",
                    "target_symptoms": [],
                    "target_history": [],
                    "reason": "继续收集病史信息。",
                }
            else:
                # Analyze information gaps based on current state
                gap_prompt = format_prompt(
                    INFO_GAP_PROMPT,
                    {
                        "memory_notes": case_state["memory_notes"],
                        "chief_complaint": case_state["chief_complaint"],
                        "chat_history": case_state["chat_history"],
                        "differential_diagnosis": case_state["differential_diagnosis"],
                        "examinations": self._examination_context(case_state),
                        "candidate_departments": case_state["candidate_departments"],
                    },
                )
                gap_analysis = await self._call_llm(
                    prompt=gap_prompt,
                    default={
                        "needs_more_info": False,
                        "next_question": "",
                        "target_symptoms": [],
                        "target_history": [],
                        "reason": "已有信息足够进行下一步。",
                    },
                    prompt_name="info_gap",
                    patient_id=patient_id,
                )

            should_continue = bool(gap_analysis.get("needs_more_info", False))
            next_question = clean_text(gap_analysis.get("next_question"))

            if not should_continue or not next_question:
                # If we skipped info_gap and have no question, ask a default one
                if case_state.get("mode") == "test" and case_state["question_count"] < max_questions:
                    default_questions = [
                        "请问您这种情况以前出现过吗？有没有类似的发作史或家族史？",
                        "您最近有没有服用过什么药物？有没有过敏史？",
                        "这种情况对您的日常生活影响大吗？有没有伴随其他不适？",
                    ]
                    idx = case_state["question_count"] % len(default_questions)
                    next_question = default_questions[idx]
                else:
                    break

            # Avoid duplicate questions
            already_asked = set()
            for msg in case_state["chat_history"]:
                if msg.get("from") == "doctor":
                    already_asked.add(normalize_name(msg.get("text", "")))
            if normalize_name(next_question) in already_asked:
                # Skip duplicate, try a different approach
                case_state["question_count"] += 1  # Still count to avoid infinite loop
                if case_state["question_count"] >= max_questions:
                    break
                continue

            # Ask the targeted question
            answer = await self._safe_ask_patient(
                case_state,
                patient_id,
                next_question,
            )
            case_state["chat_history"].append({"from": "doctor", "text": next_question})
            case_state["chat_history"].append({"from": "patient", "text": answer})
            case_state["question_count"] += 1

            # Extract structured symptoms from the answer
            self._extract_symptoms_from_answer(case_state, answer)

            # Update differential based on new information (optional - use LLM)
            # In test mode, only update once to save time
            if case_state.get("mode") == "test":
                if case_state["question_count"] == 2:
                    await self._update_differential(case_state, patient_id)
            else:
                if case_state["question_count"] % 2 == 0:
                    await self._update_differential(case_state, patient_id)

            case_state["decision_trace"].append({
                "action": "ask_patient",
                "question": next_question,
                "reason": clean_text(gap_analysis.get("reason")),
            })

        # Always ask about past history, allergies, and medications if not covered
        if case_state["question_count"] < max_questions and not any(
            "过敏" in str(msg.get("text", "")) or "药物" in str(msg.get("text", ""))
            for msg in case_state["chat_history"]
        ):
            answer = await self._safe_ask_patient(
                case_state,
                patient_id,
                "请问您有没有药物或食物过敏史？目前正在服用什么药物？有没有高血压、糖尿病或其他慢性病史？",
            )
            case_state["chat_history"].append({"from": "doctor", "text": "请问您有没有药物或食物过敏史？目前正在服用什么药物？有没有高血压、糖尿病或其他慢性病史？"})
            case_state["chat_history"].append({"from": "patient", "text": answer})
            case_state["question_count"] += 1
            self._extract_symptoms_from_answer(case_state, answer)

    def _extract_symptoms_from_answer(self, case_state: Dict[str, Any], answer: str) -> None:
        """Lightweight extraction of symptoms from patient answers."""
        # Store the raw answer for LLM-based processing
        # Simple keyword-based extraction as first pass
        symptom_keywords = [
            "发烧", "发热", "疼痛", "肿", "皮疹", "咳嗽", "呼吸困难", "乏力",
            "头痛", "胸痛", "腹痛", "恶心", "呕吐", "腹泻", "便秘", "出血",
            "麻木", "头晕", "心悸", "浮肿", "消瘦", "食欲", "睡眠", "出汗",
        ]
        for kw in symptom_keywords:
            if kw in answer and kw not in case_state["symptoms"]:
                # Find context around the keyword
                idx = answer.find(kw)
                context = answer[max(0, idx-30):idx+50].strip()
                case_state["symptoms"][kw] = {
                    "status": "mentioned",
                    "details": context,
                }

    async def _update_differential(self, case_state: Dict[str, Any], patient_id: str) -> None:
        """Update the differential diagnosis based on accumulated information."""
        # Get diseases from candidate departments
        candidate_diseases = []
        for dept in case_state["candidate_departments"]:
            candidate_diseases.extend(self.disease_catalog.get(dept, []))

        # Limit to a reasonable number for the prompt
        limited_diseases = candidate_diseases[:60]

        update_prompt = format_prompt(
            DEPARTMENT_PROMPT,  # Reuse this for updating differential
            {
                "memory_notes": case_state["memory_notes"],
                "chat_history": case_state["chat_history"],
                "examinations": self._examination_context(case_state),
                "departments": case_state["candidate_departments"],
            },
        )
        dept_decision = await self._call_llm(
            prompt=update_prompt,
            default={"department": case_state["top_department"], "reason": ""},
            prompt_name="update_differential",
            patient_id=patient_id,
        )
        new_dept = match_standard_name(dept_decision.get("department"), self.department_map)
        if new_dept:
            case_state["top_department"] = new_dept
            if new_dept not in case_state["candidate_departments"]:
                case_state["candidate_departments"].insert(0, new_dept)

    # ================================================================
    # PHASE 3: Examination Strategy
    # ================================================================
    async def _examination_phase(self, case_state: Dict[str, Any], patient_id: str) -> None:
        """Select and order examinations based on the differential diagnosis.

        Strategy: only order exams that would help discriminate between
        top differential candidates or that are essential for the top diagnosis.
        """
        # If we already have enough info, may skip or do minimal exams
        # Keep 2 categories in both modes - exams are critical for precision
        max_categories = min(
            int(self.config.get("max_exam_categories", MAX_EXAM_CATEGORIES)),
            len(self.exam_categories),
        )

        for round_idx in range(max_categories):
            chat_history = case_state.get("chat_history", [])
            examinations = self._examination_context(case_state)
            top_dept = case_state.get("top_department", "")

            # Select exam category based on department and differential
            skills_for_exam = self._retrieve_skills(case_state, top_k=2)
            category_prompt = format_prompt(
                EXAM_CATEGORY_PROMPT,
                {
                    "memory_notes": case_state["memory_notes"],
                    "chat_history": chat_history,
                    "examinations": examinations,
                    "exam_categories": self.exam_categories,
                    "skills_knowledge": skills_for_exam,
                },
            )
            category_decision = await self._call_llm(
                prompt=category_prompt,
                default={"category": self.exam_categories[0] if self.exam_categories else "", "reason": ""},
                prompt_name="exam_category",
                patient_id=patient_id,
            )
            category = match_standard_name(category_decision.get("category"), self.exam_category_map)
            if not category:
                # Try to pick a sensible category based on department
                category = self._default_category_for_department(top_dept)
            if not category:
                break

            # Select specific exams from this category
            item_prompt = format_prompt(
                EXAM_ITEM_PROMPT,
                {
                    "memory_notes": case_state["memory_notes"],
                    "chat_history": chat_history,
                    "examinations": examinations,
                    "category": category,
                    "exam_items": self.examination_catalog.get(category, []),
                },
            )
            item_decision = await self._call_llm(
                prompt=item_prompt,
                default={"examinations": [], "reason": category_decision.get("reason", "")},
                prompt_name="exam_item",
                patient_id=patient_id,
            )

            allowed_exam_map = build_name_map(self.examination_catalog.get(category, []))
            already_ordered = set(as_text_list(case_state["ordered_examinations"]))
            exam_names = []
            for item in as_text_list(item_decision.get("examinations")):
                standard_name = match_standard_name(item, allowed_exam_map)
                if not standard_name or standard_name in already_ordered or standard_name in exam_names:
                    continue
                exam_names.append(standard_name)
                if len(exam_names) >= MAX_EXAMS_PER_ORDER:
                    break

            if not exam_names:
                continue

            exam_plan = {
                "category": category,
                "examinations": exam_names,
                "reason": clean_text(item_decision.get("reason") or category_decision.get("reason")),
            }
            case_state["exam_decision_trace"].append(exam_plan)

            try:
                await self._rate_limit()
                exam_response = await self.actions.order_examination(
                    patient_id,
                    exam_names,
                    reason=exam_plan.get("reason", ""),
                )
            except Exception as e:
                # Handle content security errors (HTTP 555) or rate limits
                error_msg = str(e)
                if "555" in error_msg or "security" in error_msg.lower():
                    # Content security check failed - skip these exams and continue
                    print(f"  [安全审查] 检查 {exam_names} 被拒绝，跳过并继续")
                    case_state["invalid_examinations"].extend(exam_names)
                    continue
                else:
                    # Other errors - also skip gracefully
                    print(f"  [错误] 检查调用失败: {error_msg[:200]}")
                    case_state["invalid_examinations"].extend(exam_names)
                    continue
            
            case_state["ordered_examinations"].extend(
                as_text_list(exam_response.get("normalized_items"))
            )
            case_state["invalid_examinations"].extend(
                as_text_list(exam_response.get("invalid_items"))
            )
            results = exam_response.get("results") or {}
            if isinstance(results, dict):
                case_state["examination_results"].update(results)

    def _heuristic_departments(self, chief_complaint: str) -> List[str]:
        """Heuristic department suggestions based on chief complaint keywords.

        This helps handle cross-department cases where the LLM's triage
        might miss the correct department.
        """
        text = str(chief_complaint or "")
        suggestions = []

        # Skin-related keywords
        skin_keywords = ["皮疹", "水泡", "溃疡", "红斑", "湿疹", "瘙痒", "痤疮", "瘢痕", "皮肤", "疱疹", "疣", "癣"]
        if any(kw in text for kw in skin_keywords):
            suggestions.extend(["皮肤科", "感染科", "免疫科"])

        # Respiratory
        resp_keywords = ["咳嗽", "咳痰", "呼吸", "喘息", "胸痛", "肺炎", "哮喘"]
        if any(kw in text for kw in resp_keywords):
            suggestions.extend(["呼吸内科", "感染科"])

        # Cardiac
        cardiac_keywords = ["心悸", "胸痛", "心慌", "气短", "水肿", "心衰", "心律"]
        if any(kw in text for kw in cardiac_keywords):
            suggestions.extend(["心内科"])

        # GI
        gi_keywords = ["腹痛", "腹泻", "恶心", "呕吐", "便秘", "胃", "消化", "腹胀"]
        if any(kw in text for kw in gi_keywords):
            suggestions.extend(["消化内科", "普外科"])

        # Neuro
        neuro_keywords = ["头痛", "头晕", "麻木", "抽搐", "瘫痪", "意识", "神经", "偏瘫"]
        if any(kw in text for kw in neuro_keywords):
            suggestions.extend(["神经内科"])

        # Fever/infection
        fever_keywords = ["发烧", "发热", "高热", "寒战"]
        if any(kw in text for kw in fever_keywords):
            suggestions.extend(["感染科", "儿科"])

        # Joint/bone
        joint_keywords = ["关节", "骨", "骨折", "腰痛", "颈痛", "扭伤"]
        if any(kw in text for kw in joint_keywords):
            suggestions.extend(["骨科"])

        # Return unique depts that exist in our catalog
        result = []
        for dept in suggestions:
            if dept in self.departments and dept not in result:
                result.append(dept)
        return result[:3]

    def _default_category_for_department(self, department: str) -> str:
        """Return a sensible default exam category for a department."""
        dept_to_category = {
            "心内科": "电生理检查",
            "皮肤科": "体格检查",
            "内分泌科": "实验室检查 - 血液",
            "消化内科": "内镜检查",
            "呼吸内科": "影像学检查 - X线",
            "神经内科": "影像学检查 - CT",
            "骨科": "影像学检查 - X线",
            "眼科": "体格检查",
            "耳鼻咽喉科": "体格检查",
            "感染科": "实验室检查 - 血液",
            "血液科": "实验室检查 - 血液",
            "免疫科": "实验室检查 - 免疫学",
            "肾内科": "实验室检查 - 尿液和粪便",
            "普外科": "影像学检查 - CT",
            "泌尿外科": "影像学检查 - 超声",
            "肿瘤科": "影像学检查 - CT",
            "妇产科": "影像学检查 - 超声",
            "儿科": "体格检查",
            "口腔科": "体格检查",
        }
        return dept_to_category.get(department, "体格检查")

    # ================================================================
    # PHASE 4: Multi-specialist Consultation + Final Decision
    # ================================================================
    def _retrieve_skills(self, case_state: Dict[str, Any], top_k: int = 3) -> str:
        """Retrieve relevant clinical skills based on current case state."""
        if self.skills_manager is None:
            return ""
        
        # Build a complaint summary from symptoms and chief complaint
        complaint_parts = []
        if case_state.get("chief_complaint"):
            complaint_parts.append(case_state["chief_complaint"])
        if case_state.get("symptoms"):
            complaint_parts.extend(list(case_state["symptoms"].keys()))
        
        complaint = " ".join(complaint_parts)
        
        # Also consider top department for better matching
        top_dept = case_state.get("top_department", "")
        if top_dept:
            # Biase towards skills from the top department
            for skill in self.skills_manager.skills.values():
                if skill["department"] == top_dept:
                    complaint += " " + skill.get("disease", "")
        
        try:
            matched = self.skills_manager.match_candidate_skills(complaint, top_k=top_k)
            if matched:
                return self.skills_manager.format_skills_for_prompt(matched)
        except Exception as e:
            print(f"  [Skills] 检索失败: {e}")
        return ""

    async def _specialist_consult_and_decide(
        self, case_state: Dict[str, Any], patient_id: str, mode: str
    ) -> Dict[str, Any]:
        """Simulate multi-specialist consultation (inspired by MMedAgent-RL).

        Instead of just one diagnosis pass, we:
        1. Have the LLM play 2-3 specialist roles independently
        2. Reconcile their outputs via an "attending physician"
        3. Apply safety review
        """
        chat_history = case_state.get("chat_history", [])
        examinations = self._examination_context(case_state)
        top_dept = case_state.get("top_department", self.departments[0] if self.departments else "")

        # Get diseases from ALL candidate departments (cross-department diagnosis support)
        diseases_limited = []
        seen_diseases = set()
        for dept in case_state.get("candidate_departments", [top_dept]):
            for disease in self.disease_catalog.get(dept, []):
                norm = normalize_name(disease)
                if norm not in seen_diseases:
                    seen_diseases.add(norm)
                    diseases_limited.append(disease)

        # If too many, keep the first 60 most relevant
        if len(diseases_limited) > 60:
            # Prioritize top department diseases, then others
            diseases_limited = diseases_limited[:60]

        # ==========================================================
        # Step 1: Specialist consultation (2 perspectives)
        # ==========================================================
        # Retrieve relevant Skills knowledge
        skills_text = self._retrieve_skills(case_state, top_k=3)
        
        specialist_prompt = format_prompt(
            SPECIALIST_CONSULT_PROMPT,
            {
                "memory_notes": case_state["memory_notes"],
                "chat_history": chat_history,
                "examinations": examinations,
                "top_department": top_dept,
                "diseases": diseases_limited,
                "specialist_role": "全科医生（综合评估）",
                "skills_knowledge": skills_text,
            },
        )
        specialist1 = await self._call_llm(
            prompt=specialist_prompt,
            default={
                "diagnosis": diseases_limited[0] if diseases_limited else "未明确诊断",
                "differential": diseases_limited[:3] if diseases_limited else [],
                "confidence": 0.5,
                "treatment_plan": "建议进一步完善检查后制定方案。",
                "reasoning": "",
            },
            prompt_name="specialist_1",
            patient_id=patient_id,
        )

        # Second specialist with a different role
        specialist_prompt2 = format_prompt(
            SPECIALIST_CONSULT_PROMPT,
            {
                "memory_notes": case_state["memory_notes"],
                "chat_history": chat_history,
                "examinations": examinations,
                "top_department": top_dept,
                "diseases": diseases_limited,
                "specialist_role": f"{top_dept}专科医生（侧重鉴别诊断）",
            },
        )
        specialist2 = await self._call_llm(
            prompt=specialist_prompt2,
            default={
                "diagnosis": diseases_limited[0] if diseases_limited else "未明确诊断",
                "differential": diseases_limited[:3] if diseases_limited else [],
                "confidence": 0.5,
                "treatment_plan": "建议进一步完善检查后制定方案。",
                "reasoning": "",
            },
            prompt_name="specialist_2",
            patient_id=patient_id,
        )

        # ==========================================================
        # Step 2: Attending Physician — reconcile and finalize
        # ==========================================================
        attending_prompt = format_prompt(
            ATTENDING_PHYSICIAN_PROMPT,
            {
                "memory_notes": case_state["memory_notes"],
                "chat_history": chat_history,
                "examinations": examinations,
                "top_department": top_dept,
                "diseases": diseases_limited,
                "specialist_opinion_1": specialist1,
                "specialist_opinion_2": specialist2,
                "skills_knowledge": skills_text,
            },
        )
        attending = await self._call_llm(
            prompt=attending_prompt,
            default={
                "diagnosis": diseases_limited[0] if diseases_limited else "未明确诊断",
                "treatment_plan": "当前信息不足以制定特异性治疗方案；建议补充关键病史和必要辅助检查后再决策。",
                "reasoning": "综合两位专科医生意见后形成最终判断。",
                "confidence": 0.5,
            },
            prompt_name="attending_physician",
            patient_id=patient_id,
        )

        # Standardize diagnosis name
        final_diagnosis = match_standard_name(
            attending.get("diagnosis"),
            build_name_map(diseases_limited),
        )
        if not final_diagnosis and diseases_limited:
            final_diagnosis = diseases_limited[0]
        if not final_diagnosis:
            final_diagnosis = "未明确诊断"

        treatment_plan = clean_text(attending.get("treatment_plan"))
        if not treatment_plan:
            treatment_plan = "当前信息不足以制定特异性治疗方案；建议补充关键病史和必要辅助检查后再决策。"
        reasoning = clean_text(attending.get("reasoning"))

        # ==========================================================
        # Step 3: Safety review
        # ==========================================================
        safety_prompt = format_prompt(
            SAFETY_REVIEW_PROMPT,
            {
                "diagnosis": final_diagnosis,
                "treatment_plan": treatment_plan,
                "chat_history": chat_history,
                "examinations": examinations,
                "memory_notes": case_state["memory_notes"],
            },
        )
        safety_review = await self._call_llm(
            prompt=safety_prompt,
            default={"is_safe": True, "corrections": ""},
            prompt_name="safety_review",
            patient_id=patient_id,
        )

        is_safe = safety_review.get("is_safe", True)
        corrections = clean_text(safety_review.get("corrections"))
        if not is_safe and corrections:
            treatment_plan = corrections

        # ==========================================================
        # Record and submit
        # ==========================================================
        case_state["final_plan"] = {
            "department": top_dept,
            "diagnosis": final_diagnosis,
            "treatment_plan": treatment_plan,
            "reasoning": reasoning,
            "specialists": [specialist1, specialist2],
            "safety_review": safety_review,
        }

        await self._rate_limit()
        final_result = await self.actions.prescribe_treatment(
            patient_id=patient_id,
            diagnosis=[final_diagnosis],
            treatment_plan=treatment_plan,
            reasoning=reasoning,
        )
        return final_result

    # ================================================================
    # Utility methods
    # ================================================================
    async def _rate_limit(self):
        """Add delay between API calls to avoid 429 rate limiting.
        
        In test mode: no delay (evaluation platform handles rate limiting)
        In train mode: short 0.5s delay to be safe
        """
        if self._current_mode == "test":
            return  # No delay in test mode
        await asyncio.sleep(0.5)  # Short delay in train mode

    async def _call_llm(
        self,
        *,
        prompt: str,
        default: Dict[str, Any],
        prompt_name: str = "",
        patient_id: str = "",
    ) -> Dict[str, Any]:
        await self._rate_limit()
        response = await self.llm.call(prompt, system_prompt=DOCTOR_SYSTEM_PROMPT, temperature=0.2)
        parsed = parse_json_object(response)
        if parsed is not None:
            self._write_prompt_log(
                prompt_name=prompt_name,
                patient_id=patient_id,
                system_prompt=DOCTOR_SYSTEM_PROMPT,
                user_prompt=prompt,
                response=response,
            )
            return parsed

        # Try to repair incomplete JSON
        repair_prompt = "请修复以下内容为合法 JSON 对象：\n\n%s" % response
        repaired = await self.llm.call(repair_prompt, system_prompt=JSON_REPAIR_SYSTEM_PROMPT, temperature=0)
        parsed = parse_json_object(repaired)
        result = parsed if parsed is not None else dict(default)
        self._write_prompt_log(
            prompt_name=prompt_name,
            patient_id=patient_id,
            system_prompt=DOCTOR_SYSTEM_PROMPT,
            user_prompt=prompt,
            response=response,
        )
        return result

    def _write_prompt_log(
        self,
        *,
        prompt_name: str,
        patient_id: str,
        system_prompt: str,
        user_prompt: str,
        response: str,
    ) -> None:
        if not bool(self.config.get("log_llm_prompts", False)):
            return
        if self.logger is None:
            return
        output_dir = getattr(self.logger, "output_dir", None)
        if output_dir is None:
            return
        prompt_dir = Path(output_dir) / "llm_prompts"
        prompt_dir.mkdir(parents=True, exist_ok=True)
        filename = "%s_%s.txt" % (prompt_name, patient_id)
        path = prompt_dir / filename
        content = "\n".join(
            [
                "timestamp: %s" % datetime.now(timezone.utc).astimezone().isoformat(),
                "prompt_name: %s" % prompt_name,
                "patient_id: %s" % patient_id,
                "",
                "system_prompt:",
                system_prompt,
                "",
                "user_prompt:",
                user_prompt,
                "",
                "response:",
                response,
                "",
                "=" * 80,
                "",
            ]
        )
        with path.open("a", encoding="utf-8") as file:
            file.write(content)

    def _examination_context(self, case_state: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "ordered_examinations": unique_preserve_order(
                case_state.get("ordered_examinations", [])
            ),
            "examination_results": case_state.get("examination_results", {}),
        }

    def _evaluation_details(self, evaluation_report: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "diagnosisDetail": evaluation_report.get("diagnosisDetail", {}),
            "examinationDetail": evaluation_report.get("examinationDetail", {}),
            "treatmentDetail": evaluation_report.get("treatmentDetail", {}),
        }


# ================================================================
# Helper functions
# ================================================================
def build_name_map(names: Iterable[str]) -> Dict[str, str]:
    result = {}
    for name in names:
        normalized = normalize_name(name)
        if normalized and normalized not in result:
            result[normalized] = name
    return result


def load_examination_catalog() -> Dict[str, List[str]]:
    data = json.loads((REF_DATA_DIR / "examinations_catalog.json").read_text(encoding="utf-8"))
    catalog: Dict[str, List[str]] = {}
    for category, items in data.get("examinations", {}).items():
        names = []
        for item in items if isinstance(items, list) else []:
            name = item.get("name") if isinstance(item, dict) else item
            if str(name or "").strip():
                names.append(str(name).strip())
        if names:
            catalog[str(category)] = names
    return catalog


def load_disease_catalog() -> Dict[str, List[str]]:
    data = json.loads((REF_DATA_DIR / "diseases_catalog.json").read_text(encoding="utf-8"))
    catalog: Dict[str, List[str]] = {}
    for department, names in data.get("diseases", {}).items():
        clean_names = [str(name).strip() for name in names if str(name).strip()]
        if clean_names:
            catalog[str(department)] = clean_names
    return catalog


def match_standard_name(value: Any, name_map: Dict[str, str]) -> str:
    text = clean_text(value)
    if not text:
        return ""
    return name_map.get(normalize_name(text), "")


def as_text_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, dict):
        value = value.values()
    if not isinstance(value, Iterable):
        return [str(value).strip()] if str(value).strip() else []
    items = []
    for item in value:
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def unique_preserve_order(values: Iterable[str]) -> List[str]:
    seen = set()
    result = []
    for value in as_text_list(values):
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def parse_json_object(raw: Any) -> Optional[Dict[str, Any]]:
    text = str(raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()
        else:
            text = text.strip("`").strip()

    candidates = [text]
    match = re.search(r"\{.*\}", text, flags=re.S)
    if match:
        candidates.append(match.group(0))
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def normalize_name(value: Any) -> str:
    text = str(value or "").lower()
    return re.sub(r"[\s\-_/，,。.;；:：、（）()\[\]【】]+", "", text)


def clean_text(value: Any) -> str:
    return str(value or "").strip()


if __name__ == "__main__":
    config = load_config("config.yaml")
    memory = build_memory(config)
    agent = MyDoctorAgent(config=config, memory=memory)
    AgentBuilder(agent).start()
