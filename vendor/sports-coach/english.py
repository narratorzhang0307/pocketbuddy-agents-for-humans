"""English presentation of existing rule results; original rule code and scores stay intact."""
import json
from pathlib import Path

FEEDBACK = json.loads((Path(__file__).parent / "feedback.en.json").read_text())
SEVERITY = {"轻": "mild", "中": "moderate", "重": "major"}
INVALID_REASONS = {
    "序列过短": "Not enough continuous pose frames to assess.",
    "关键点置信度不足，无法可靠评估": "Pose confidence is too low for reliable feedback.",
    "未识别到目标挥拍动作": "No matching swing observation is available.",
    "未识别到目标篮球动作": "No matching basketball observation is available.",
    "未识别到目标足球动作": "No matching football observation is available.",
    "未识别到目标排球动作": "No matching volleyball observation is available.",
    "未检测到跳绳动作": "No jump-rope movement is available to assess.",
    "未检测到明显跳跃，无法评估": "No clear jumps observed. Keep your whole body in view and try again.",
}


def localize_assessment(sport, result):
    data = result.to_dict()
    action = next(item for item in sport["actions"] if item["id"] == result.cls_id)
    data["cls_name"] = action["name"]
    data["invalid_reason"] = "" if result.valid else INVALID_REASONS.get(result.invalid_reason, "This observation cannot be assessed. Please try again.")
    words = FEEDBACK[sport["id"]]
    data["errors"] = [dict(item, name=words[item["code"]]["name"], severity=SEVERITY[item["severity"]]) for item in data["errors"]]
    if not result.valid:
        data["correction"] = ""
        data["full_text"] = f'[{action["name"]}] {data["invalid_reason"]}'
        return data
    data["correction"] = (words[max(result.errors, key=lambda error: error.deviation).code]["cue"]
                          if result.errors else "No issues flagged by these pose rules.")
    lines = [f'[{action["name"]}] Rule-based score: {result.score:.0f}/100']
    for error in data["errors"][:3]:
        lines.append(f'{error["severity"].capitalize()}: {error["name"]}. {words[error["code"]]["cue"]}')
    data["full_text"] = "\n".join(lines) if result.errors else lines[0] + ". " + data["correction"]
    return data
