# -*- coding: utf-8 -*-
"""
Main Builder Script: Integrates and validates all 19 department skill files.
"""
import os
import json
import re

# Load all valid diseases and departments from all_diseases.txt
with open('all_diseases.txt', 'r', encoding='utf-8') as f:
    raw_text = f.read()

dept_pattern = re.findall(r'## (.*?) \((\d+)种\)\n([\s\S]*?)(?=(?:##|\Z))', raw_text)
valid_departments = {}
for d_name, count, diseases_str in dept_pattern:
    diseases = [line.strip('- ').strip() for line in diseases_str.strip().split('\n') if line.strip().startswith('-')]
    valid_departments[d_name] = set(diseases)

print(f"Total valid departments from all_diseases.txt: {len(valid_departments)}")

import generate_all_skills
import skills_dept_oral_derm_endo
import skills_dept_gi_surg_hem_imm
import skills_dept_inf_neph_neuro_obgyn
import skills_dept_onco_ophth_ortho_ent
import skills_dept_ped_resp_uro

all_skills_list = []
all_skills_list.extend(generate_all_skills.skills_cardio)
all_skills_list.extend(skills_dept_oral_derm_endo.SKILLS)
all_skills_list.extend(skills_dept_gi_surg_hem_imm.SKILLS)
all_skills_list.extend(skills_dept_inf_neph_neuro_obgyn.SKILLS)
all_skills_list.extend(skills_dept_onco_ophth_ortho_ent.SKILLS)
all_skills_list.extend(skills_dept_ped_resp_uro.SKILLS)

print(f"Total skills collected: {len(all_skills_list)}")

# Validation check
dept_skills_map = {}
for skill in all_skills_list:
    d = skill['disease']
    dept = skill['department']
    if dept not in valid_departments:
        raise ValueError(f"Unknown department: {dept}")
    if d not in valid_departments[dept]:
        raise ValueError(f"Disease '{d}' not in valid list for department '{dept}' in all_diseases.txt")
    
    # Check JSON structure
    assert "disease" in skill
    assert "department" in skill
    assert "presentation" in skill
    assert "interview_guide" in skill
    assert "first_questions" in skill["interview_guide"]
    assert "followup_questions" in skill["interview_guide"]
    assert "stop_conditions" in skill["interview_guide"]
    assert "exam_strategy" in skill
    assert "essential" in skill["exam_strategy"]
    assert "if_suspected" in skill["exam_strategy"]
    assert "avoid" in skill["exam_strategy"]
    assert "treatment" in skill
    assert "first_line" in skill["treatment"]
    assert "safety_warnings" in skill["treatment"]
    assert "personalization" in skill["treatment"]
    
    if dept not in dept_skills_map:
        dept_skills_map[dept] = []
    dept_skills_map[dept].append(skill)

print("All skills validated successfully against schema and all_diseases.txt!")

# Ensure data/skills directory exists
os.makedirs('data/skills', exist_ok=True)

# Write department files
for dept, skills in dept_skills_map.items():
    dept_file = os.path.join('data/skills', f"{dept}.json")
    with open(dept_file, 'w', encoding='utf-8') as f:
        json.dump(skills, f, ensure_ascii=False, indent=2)
    print(f"Wrote {dept_file} ({len(skills)} diseases)")

# Write consolidated skills.json
consolidated_file = os.path.join('data/skills', "skills.json")
with open(consolidated_file, 'w', encoding='utf-8') as f:
    json.dump(all_skills_list, f, ensure_ascii=False, indent=2)
print(f"Wrote {consolidated_file} ({len(all_skills_list)} total skills)")

# Build and write index
skills_index = {
    "total_departments": len(dept_skills_map),
    "total_skills": len(all_skills_list),
    "departments": list(dept_skills_map.keys()),
    "skills_by_department": {dept: [s["disease"] for s in skills] for dept, skills in dept_skills_map.items()}
}
index_file = os.path.join('data/skills', "skills_index.json")
with open(index_file, 'w', encoding='utf-8') as f:
    json.dump(skills_index, f, ensure_ascii=False, indent=2)
print(f"Wrote {index_file}")

# Verify all 19 departments are covered
missing_depts = set(valid_departments.keys()) - set(dept_skills_map.keys())
if missing_depts:
    print(f"WARNING: Missing departments: {missing_depts}")
else:
    print("SUCCESS: All 19 departments fully covered!")
