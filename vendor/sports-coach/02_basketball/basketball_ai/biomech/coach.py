# -*- coding: utf-8 -*-
"""篮球教学话术生成：由规则引擎的 ErrorItem 驱动，逐错误码映射固定教学模板。"""
from typing import Dict

from .rules import Assessment

COACH_DB: Dict[str, tuple] = {
    "E01": ("出手点再抬高：手臂完全伸展，在头顶前上方出手", "靠墙高出手点定投50次，手碰墙沿"),
    "E02": ("出手后手腕前压、手指指向篮筐，保持跟随动作", "卧推式压腕练习：投篮后定住鹅颈手型3秒"),
    "E03": ("肘部内收对准篮筐，不要外翻", "镜子前单手拨球，肘尖对筐校正"),
    "E04": ("出手弧度再高一些，瞄准45-50度入筐", "高弧度投过绳/标志杆练习"),
    "E05": ("起跳保持竖直，不要前冲后仰", "竖直起跳摸篮板落回原点练习"),
    "E06": ("投篮要起跳借力，增加出手高度", "不持球跳投模仿：蹲-跳-伸臂连贯50次"),
    "E07": ("先屈膝沉髋再发力，力量从脚下开始", "徒手深蹲接快速起立节奏练习"),
    "E08": ("双脚同时起跳落地，保持身体平衡", "双脚跳绳/跳台阶找对称发力感"),
    "E09": ("运球用手腕手指按压球，不要僵硬推拍", "原地大力高运球接手指拨球各30次"),
    "E10": ("运球降低高度，控制在腰部以下", "低运球绕障碍物：球不过膝30秒×5组"),
    "E11": ("抬头运球，用余光看球，眼睛看场上", "抬头运球过人墙/报数练习"),
    "E12": ("上篮时起跳腿高抬膝，护球带上步节奏", "一步上篮抬膝触手高度标志练习"),
    "E13": ("重心降下来：屈膝沉髋，保持在低位", "滑步保持低重心的折返练习"),
    "E14": ("双脚开立与肩同宽或略宽，站稳下盘", "防守滑步宽站位定时练习"),
    "E15": ("重心保持在两脚之间，不要左右晃", "宽站位左右手交替运球稳重心"),
}

SEV_WORD = {"轻": "轻微", "中": "明显", "重": "严重"}


def coach_full(a: Assessment) -> str:
    if not a.valid:
        return f"[{a.cls_name}] 暂无法评估：{a.invalid_reason}"
    head = f"[{a.cls_name}] 动作得分 {a.score:.0f}/100"
    if not a.errors:
        return head + "，动作规范，保持！"
    lines = [head]
    for e in a.errors[:3]:
        fix, drill = COACH_DB[e.code]
        lines.append(f"· {SEV_WORD[e.severity]}问题：{e.name} → {fix}（练习：{drill}）")
    return "\n".join(lines)


def coach_voice(a: Assessment, max_items: int = 1) -> str:
    if not a.valid:
        return ""
    if not a.errors:
        return f"{a.cls_name}动作规范"
    e = max(a.errors, key=lambda x: x.deviation)
    fix, _ = COACH_DB[e.code]
    return fix
