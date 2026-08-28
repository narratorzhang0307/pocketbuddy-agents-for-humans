# -*- coding: utf-8 -*-
"""
skills_retriever.py
Provides dynamic retrieval and prompt formatting of Clinical Skills for the Virtual Clinic Doctor Agent.
"""
import os
import json
import re

class MedicalSkillManager:
    def __init__(self, skills_dir="data/skills"):
        self.skills_dir = skills_dir
        self.skills = {}
        self.department_map = {}
        self.load_skills()

    def load_skills(self):
        skills_file = os.path.join(self.skills_dir, "skills.json")
        if not os.path.exists(skills_file):
            raise FileNotFoundError(f"Skills file not found: {skills_file}")
        
        with open(skills_file, "r", encoding="utf-8") as f:
            skill_list = json.load(f)
            
        for s in skill_list:
            dis = s["disease"]
            dept = s["department"]
            self.skills[dis] = s
            if dept not in self.department_map:
                self.department_map[dept] = []
            self.department_map[dept].append(dis)

    def get_skill(self, disease_name):
        return self.skills.get(disease_name)

    def match_candidate_skills(self, patient_complaint, top_k=3):
        """
        Simple keyword-based semantic matching for candidate diseases based on presentation keywords.
        """
        scored_diseases = []
        for dis, skill in self.skills.items():
            score = 0
            presentation = skill.get("presentation", "")
            first_q = "".join(skill.get("interview_guide", {}).get("first_questions", []))
            
            # Match keywords
            keywords = [dis, skill["department"]]
            keywords += re.findall(r'[\u4e00-\u9fa5]{2,4}', dis)
            keywords += re.findall(r'[\u4e00-\u9fa5]{2,4}', presentation[:50])
            
            for kw in set(keywords):
                if len(kw) >= 2 and kw in patient_complaint:
                    score += 2
                    
            if dis in patient_complaint:
                score += 10

            if score > 0:
                scored_diseases.append((dis, score))

        scored_diseases.sort(key=lambda x: x[1], reverse=True)
        return [self.skills[d[0]] for d in scored_diseases[:top_k]]

    def format_skills_for_prompt(self, matched_skills):
        """
        Formats retrieved skills into a clean, compact markdown/JSON injection block for LLM prompt.
        """
        if not matched_skills:
            return "暂无匹配的特定疾病Skill知识库，请严格遵循循证医学原则诊疗。"

        output_str = "### 【检索到的临床诊疗Skill知识库】\n"
        for i, skill in enumerate(matched_skills, 1):
            output_str += f"\n#### Skill {i}: {skill['disease']} ({skill['department']})\n"
            output_str += f"```json\n{json.dumps(skill, ensure_ascii=False, indent=2)}\n```\n"
        return output_str


def build_doctor_agent_system_prompt(retrieved_skills_text, valid_diseases_summary=""):
    prompt = f"""你是一个参加全国"虚拟诊疗比赛"的资深主治医师AI智能体（Doctor Agent）。
你的目标是通过严谨、安全、合规的多轮人机交互，为虚拟患者提供最高质量的诊疗服务。

【比赛核心考核规则】：
1. 【多轮问诊收集病史】：
   - 首轮问诊抓住核心主诉，围绕诱因、时限、性质、程度、伴随症状进行结构化提问（每次提问控制在2-3个关键问题以内，避免机械查户口）。
   - 深入追问鉴别诊断与危险警示征象（Red Flags），达到信息充足条件（Stop Conditions）后立即进入检查或诊断阶段，切忌无意义过度多轮闲聊。
2. 【合理开具检查（避免过度医疗）】：
   - 仅开具确诊所必需的检查（Essential）与合理鉴别检查（If Suspected）。
   - 严禁开具不相关、高辐射、高创伤或禁忌检查（Avoid），违规开具将遭受严重扣分甚至零分惩罚。
3. 【给出明确诊断（严格限定在标准疾病名录中）】：
   - 最终确诊名称必须 100% 精确匹配比赛官方的 584 种标准疾病名录中的标准名称，禁止自造词或别名模糊诊断。
4. 【给出治疗方案（安全 > 有效 > 个性化）】：
   - 必须优先确保用药安全：严格规避禁忌症、黑框警告与药物相互作用。
   - 给出标准一线治疗方案（药物剂量、疗程、非药物生活方式干预）。
   - 针对患者的年龄、性别、肝肾功能、妊娠备孕等特殊生理病理状态提供个性化调整。

{retrieved_skills_text}

【当前行动指引】：
根据患者当前的最新回复与对话历史，严格参考上述 Skill 中的 interview_guide、exam_strategy、treatment 知识，输出你本轮的医生决策（问诊追问 / 检查方案 / 诊断结论 / 处方与医嘱）。
"""
    return prompt
