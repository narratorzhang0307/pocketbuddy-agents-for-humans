"""Prompt templates for the baseline doctor agent."""

from __future__ import annotations

import json
from string import Template
from typing import Any, Dict


DOCTOR_SYSTEM_PROMPT = """你是一名医生，正在根据患者信息完成一次诊疗。

基本要求：
- 根据已有对话、已开检查和检查结果做判断。
- 不要编造病史或检查结果；检查结果以系统返回为准。
- 面向患者的问题使用中文。
- 检查名称、检查类别、科室名称和诊断名称要优先使用给定的标准名称。
- 按用户消息要求输出 JSON，不要输出 Markdown 或额外说明。
"""


JSON_REPAIR_SYSTEM_PROMPT = """请把输入改写为合法 JSON 对象。
只输出 JSON，不要输出解释、Markdown、代码围栏或额外文本。"""


NEXT_ACTION_PROMPT = """根据当前病例状态，选择下一步操作。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

可选动作：
- ask_patient：问诊。选择该动作时，同时输出这一步要问患者的问题。
- order_examination：开检查。后续会先选检查类别，再从该类别中选择具体检查。
- final_diagnosis：进入诊断和治疗。后续会先选科室，再从该科室中选择疾病并给出治疗方案。

判断要点：
- 在诊断开始阶段，或者缺少诊断疾病所必需的关键信息时，优先 ask_patient。
- 如果某项检查会影响诊断或治疗，选择 order_examination。
- 如果信息已经足够，选择 final_diagnosis。

请只返回 JSON：
{
  "action": "ask_patient | order_examination | final_diagnosis",
  "question": "action=ask_patient 时填写一个中文问题，否则为空字符串",
  "reason": "简要说明选择这个动作的原因"
}
"""


EXAM_CATEGORY_PROMPT = """请选择下一步最合适的检查类别。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

可选检查类别：
$exam_categories

检索到的相关临床Skill知识库（可参考）：
$skills_knowledge

要求：
- 只能从“可选检查类别”中选择一个标准类别名称。
- 选择最能帮助确认诊断或指导治疗的检查类别。
- 避免选择已经无法提供增量信息的类别。

请只返回 JSON：
{
  "category": "一个标准检查类别名称",
  "reason": "选择该类别的原因"
}
"""


EXAM_ITEM_PROMPT = """请从指定检查类别中选择这次要开的具体检查。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

检查类别：
$category

该类别下的标准检查名称：
$exam_items

要求：
- **必须严格使用"该类别下的标准检查名称"中的字段名称**，不能自创名称或使用简称。
- **只选择当前鉴别诊断所必需的检查**。每个检查都应有明确的诊断价值：
  * 能直接确认/排除某个候选诊断
  * 能评估病情严重程度或指导治疗
  * 是标准诊疗路径中的必要步骤
- **优先级**：优先选择明确针对当前疾病的标准检查。例如：
  * 病毒感染时优先选"病毒核酸检测（Viral NAT）"（通用名称），而不是具体的某种病毒检测
  * 细菌感染时优先选"细菌培养及鉴定"（通用名称），而不是"XX培养"
  * 评估感染/炎症时优先选"全血细胞计数（CBC）"、"C反应蛋白（CRP）"
- **避免冗余检查**：如果已有检查结果能覆盖某个指标，不要再开重复的。
- **避免常规筛查**：不要开"保险起见"的无关检查，过度开检查会降低精确率得分。
- 不要选择已经做过的检查。
- 宁可少开几个关键的，不要多开无关的。

请只返回 JSON：
{
  "examinations": ["标准检查名称1", "标准检查名称2"],
  "reason": "选择这些检查的原因"
}
"""


DEPARTMENT_PROMPT = """请选择最可能负责当前诊断的科室。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

可选科室：
$departments

要求：
- 只能从“可选科室”中选择一个标准科室名称。
- 根据患者表现、检查结果和主要鉴别诊断选择。

请只返回 JSON：
{
  "department": "一个标准科室名称",
  "reason": "选择该科室的原因"
}
"""


DISEASE_AND_TREATMENT_PROMPT = """请在指定科室中选择最可能的疾病，并给出治疗方案。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

科室：
$department

该科室下的标准疾病名称：
$diseases

要求：
- diagnosis 只能填写一个“该科室下的标准疾病名称”。
- treatment_plan 用中文给出治疗方案，重点说明有效性、个性化和安全性：
  1. 有效性：针对诊断给出主要治疗、必要药物或操作。
  2. 个性化：结合患者病史、症状、检查结果、年龄/妊娠/基础病/过敏史等因素调整。
  3. 安全性：说明禁忌、监测、复诊和需要立即就医的危险信号。
- reasoning 简要说明诊断依据和治疗考虑。

请只返回 JSON：
{
  "diagnosis": "一个标准疾病名称",
  "treatment_plan": "具体治疗方案",
  "reasoning": "诊断和治疗推理"
}
"""


EVALUATION_REFLECTION_PROMPT = """训练病例已经完成，并收到了评估结果。请根据患者对话记录和评估明细写一段可复用的简短反思。

患者对话记录：
$chat_history

评估明细：
$evaluation_details

要求：
- reflection 是唯一会写入 memory 的字段。
- reflection.profile 用 1-2 句话概括患者简介，重点保留从对话记录中可复用的症状线索、关键背景或特殊风险。
- 评估明细只包含 diagnosisDetail、examinationDetail、treatmentDetail；反思时分别对照其中的 submitted/ordered、expected/reference、matched、reasoning 和分数信息。
- 诊断、检查、治疗反思要写清楚本次遗漏或做对的要点。
- 内容要短，适合后续病例作为参考摘要，不要复制长篇参考治疗原文。

请只返回 JSON：
{
  "reflection": {
    "profile": "患者简介",
    "diagnosis_reflection": "诊断方面的经验",
    "examination_reflection": "检查选择方面的经验",
    "treatment_reflection": "治疗方案方面的经验",
    "future_strategy": "以后遇到类似病例的简短策略"
  }
}
"""


def format_prompt(template: str, variables: Dict[str, Any]) -> str:
    """Format a prompt with JSON-safe values."""
    prepared = {}
    for key, value in variables.items():
        if isinstance(value, str):
            prepared[key] = value
        else:
            prepared[key] = json.dumps(value, ensure_ascii=False, indent=2)
    return Template(template).safe_substitute(prepared)


# ================================================================
# New prompts for the enhanced multi-agent architecture
# (Inspired by MMedAgent-RL and AgentMental)
# ================================================================

TRIAGE_PROMPT = """你是一名分诊医生（Triage Doctor），需要根据患者的主诉判断最可能的科室。

记忆摘要：
$memory_notes

患者主诉：
$chief_complaint

可选科室：
$departments

要求：
- 只能从"可选科室"中选择标准科室名称。
- 根据主诉中的关键症状、发病特点、风险程度选择最可能的科室。
- alternative_departments 列出 1-2 个需要鉴别可能的备选科室。

请只返回 JSON：
{
  "department": "最可能的科室名称",
  "alternative_departments": ["备选科室1", "备选科室2"],
  "reason": "分诊判断依据"
}
"""


INFO_GAP_PROMPT = """你是一名信息收集与判缺智能体（Information Gap Analyzer），根据当前已收集的病例信息，判断是否还需要追问更多信息。

记忆摘要：
$memory_notes

患者主诉：
$chief_complaint

历史对话：
$chat_history

当前鉴别诊断（候选疾病）：
$differential_diagnosis

已开检查及结果：
$examinations

候选科室：
$candidate_departments

要求：
- 如果当前信息足够支持鉴别诊断或进入下一步（开检查/诊断），设置 needs_more_info=false。
- 如果需要追问，生成一个具体、有针对性的中文问题（不是泛泛的问"还有别的吗"）。
- 追问应针对当前鉴别诊断中最关键的区分信息（如特定症状的有无、起病方式、诱因、缓解因素、暴露史等）。
- 避免重复提问已经问过的内容。
- 控制 token：在信息收益不高的阶段应尽快停止问诊。

请只返回 JSON：
{
  "needs_more_info": true/false,
  "next_question": "需要追问时填写一个具体的中文问题，否则为空",
  "target_symptoms": ["需要确认的关键症状"],
  "target_history": ["需要询问的病史要点"],
  "reason": "判断依据"
}
"""


SPECIALIST_CONSULT_PROMPT = """你是一位$specialist_role，请根据已有的病例信息独立给出诊断意见。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

最相关科室：
$top_department

该科室的标准疾病列表（只能从中选择）：
$diseases

检索到的相关临床Skill知识库（可参考）：
$skills_knowledge

要求：
- 从给定疾病列表中选择最可能的诊断。
- differential 列出 1-3 个需要鉴别的其他可能疾病（从列表中选择）。
- confidence 在 0-1 之间，表示你对这个诊断的把握程度。
- treatment_plan 用中文给出简要的治疗方案要点。
- 独立判断，不参考其他专科医生的意见。

请只返回 JSON：
{
  "diagnosis": "最可能的疾病名称",
  "differential": ["鉴别诊断1", "鉴别诊断2", "鉴别诊断3"],
  "confidence": 0.0-1.0,
  "treatment_plan": "简要治疗方案",
  "reasoning": "诊断依据和考虑"
}
"""


ATTENDING_PHYSICIAN_PROMPT = """你是主治医生（Attending Physician），需要综合两位专科医生的意见，结合你自身的判断，给出最终诊断和治疗方案。

记忆摘要：
$memory_notes

历史对话：
$chat_history

已开检查及结果：
$examinations

最相关科室：
$top_department

标准疾病列表（只能从中选择）：
$diseases

检索到的相关临床Skill知识库（可参考）：
$skills_knowledge

专科医生意见1：
$specialist_opinion_1

专科医生意见2：
$specialist_opinion_2

要求：
- 综合两位专科医生的意见和你的判断，选择最可能的诊断。
- 如果两位专科医生意见一致且合理，采纳一致意见。
- 如果意见分歧，根据病例信息判断谁更合理，或给出你的独立判断。
- diagnosis 只能从标准疾病列表中选择一个。
- treatment_plan 用中文给出具体治疗方案，兼顾安全性、有效性和个性化：
  1. 有效性：针对诊断给出主要治疗，包括药物、剂量、疗程或操作。
  2. 个性化：结合患者年龄、妊娠/哺乳、基础病、过敏史、检查结果等调整。
  3. 安全性：注意禁忌、药物相互作用、不良反应监测、随访计划。
- **重要安全原则**：
  * 如果诊断涉及活动性单纯疱疹病毒（HSV）感染、水痘或带状疱疹，**必须立即停用或暂停全身性糖皮质激素**（如泼尼松），这是绝对禁忌。
  * 不要建议"维持"或"减量"使用激素，在急性病毒感染期间应暂停使用，待病情控制后再评估恢复。
  * 治疗应以抗病毒治疗为核心，辅以必要的支持治疗。
- confidence 在 0-1 之间。

请只返回 JSON：
{
  "diagnosis": "最终诊断（标准疾病名称）",
  "treatment_plan": "具体治疗方案",
  "reasoning": "综合判断依据",
  "confidence": 0.0-1.0
}
"""


SAFETY_REVIEW_PROMPT = """你是一名独立的药物安全审查员（Safety Reviewer），请审查以下诊断和治疗方案是否存在安全性问题。

诊断：
$diagnosis

治疗方案：
$treatment_plan

患者对话摘要：
$chat_history

检查结果：
$examinations

记忆摘要（包含既往病例经验）：
$memory_notes

审查要点：
1. 药物禁忌症：是否存在与患者基础病、过敏史、年龄、妊娠状态等冲突的药物？
   **特别注意**：如果诊断为 HSV 感染、水痘、带状疱疹等病毒感染，**任何方案中不得包含"继续/维持/减量使用全身性糖皮质激素"的建议**。活动性病毒感染期间使用全身激素是绝对禁忌！
2. 药物相互作用：是否有明显的药物相互作用风险？
3. 剂量安全性：用药剂量是否在安全范围内？
4. 方案完整性：是否有明显需要急救/住院处理却被遗漏的情况？

如果方案安全，返回 is_safe=true。
如果不安全，返回 is_safe=false 并在 corrections 中给出修正后的治疗方案（用中文）。

请只返回 JSON：
{
  "is_safe": true/false,
  "issues": ["发现的安全问题列表"],
  "corrections": "不安全时给出修正后的完整治疗方案"
}
"""
