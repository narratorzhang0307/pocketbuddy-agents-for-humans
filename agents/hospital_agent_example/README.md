# 虚拟诊疗比赛 - 19科室临床Skill知识库与Doctor Agent构建指南

本项目针对“虚拟诊疗比赛”与临床医生智能体（Doctor Agent）训练设计，严格基于比赛官方提供的 **19个科室、584种标准疾病名录（all_diseases.txt）** 构建，覆盖全部科室的常见/高发疾病诊疗规范。

---

## 目录结构

```text
├── README.md                      # 项目说明文档与Agent提示词规范
├── all_diseases.txt               # 比赛官方584种标准疾病名录
├── skills_retriever.py            # Skill加载检索器与Agent Prompt组装器
├── data/
│   └── skills/                    # 结构化Skill知识库目录
│       ├── 心内科.json
│       ├── 呼吸内科.json
│       ├── 消化内科.json
│       ├── 神经内科.json
│       ├── 内分泌科.json
│       ├── 肾内科.json
│       ├── 血液科.json
│       ├── 免疫科.json
│       ├── 感染科.json
│       ├── 普外科.json
│       ├── 骨科.json
│       ├── 泌尿外科.json
│       ├── 妇产科.json
│       ├── 儿科.json
│       ├── 眼科.json
│       ├── 耳鼻咽喉科.json
│       ├── 口腔科.json
│       ├── 皮肤科.json
│       ├── 肿瘤科.json
│       ├── skills.json            # 汇总全量Skill对象
│       └── skills_index.json      # 科室与疾病索引清单
```

---

## Skill 数据结构规范 (JSON Schema)

每个疾病的 Skill 严格遵循以下结构化规范：

```json
{
  "disease": "疾病名（100%匹配all_diseases.txt标准名）",
  "department": "科室（19科室之一）",
  "presentation": "典型临床表现（如何从患者主诉中识别）",
  "interview_guide": {
    "first_questions": ["首轮该问什么（核心症状、时限、性质）"],
    "followup_questions": ["根据什么症状需追问什么（鉴别要点、红旗征）"],
    "stop_conditions": ["什么情况下信息足够可以停止问诊"]
  },
  "exam_strategy": {
    "essential": ["必查项目（确诊必须）"], 
    "if_suspected": ["怀疑时额外检查（鉴别诊断）"],
    "avoid": ["不该开的检查（过度医疗/禁忌项，防止扣分）"]
  },
  "treatment": {
    "first_line": "一线治疗（药物剂量、疗程、非药物干预）",
    "safety_warnings": ["禁忌症", "药物相互作用", "严重不良反应防范"],
    "personalization": ["特殊人群调整（老年、孕妇、肝肾不全等）"]
  }
}
```

---

## 医生 Agent System Prompt 模板

在构建比赛 Doctor Agent 时，可直接使用以下提示词模板，并在推理时动态注入检索出的候选 Skill：

```markdown
你是一个参加全国"虚拟诊疗比赛"的资深主治医师AI智能体（Doctor Agent）。
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

---

### 【本病例匹配注入的临床 Skill 知识库】：
{{matched_skills_json_block}}

---

【当前行动指引】：
根据患者当前的最新回复与对话历史，严格参考上述 Skill 中的 interview_guide、exam_strategy、treatment 知识，输出你本轮的医生决策（问诊追问 / 检查方案 / 诊断结论 / 处方与医嘱）。
```

---

## 快速使用 Python 运行

```python
from skills_retriever import MedicalSkillManager, build_doctor_agent_system_prompt

# 1. 实例化知识库管理器
manager = MedicalSkillManager(skills_dir="data/skills")

# 2. 根据患者主诉检索候选疾病 Skill
complaint = "患者主诉：右上腹剧烈阵发性绞痛2小时，吃了油腻大餐后发作，向右肩部放射，伴恶心发热。"
matched_skills = manager.match_candidate_skills(complaint, top_k=2)

# 3. 组装为包含 Skill 的医生 Agent System Prompt
skills_block = manager.format_skills_for_prompt(matched_skills)
system_prompt = build_doctor_agent_system_prompt(skills_block)

print(system_prompt)
```
