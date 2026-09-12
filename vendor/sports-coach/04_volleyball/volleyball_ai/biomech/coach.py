# -*- coding: utf-8 -*-
"""排球教学话术生成：由规则引擎的 ErrorItem 驱动，逐错误码映射固定教学模板。"""
from typing import Dict

from .rules import Assessment

COACH_DB: Dict[str, tuple] = {
    "E01": ("垫球时两臂夹紧伸直，肘关节不要弯", "对墙垫固定球：夹臂伸直找平面感"),
    "E02": ("击球点保持在腹前一臂距离，不要太高或太低", "自抛自垫：固定击球点在腰带高度"),
    "E03": ("移动到位让球落在身体正前方，不要侧身够球", "左右移动垫球：先到位再出手"),
    "E04": ("抛球要稳要高：垂直抛过头顶约一臂", "原地抛球练习：抛球落回掌心30次"),
    "E05": ("发球击球点再抬高些，在头顶前上方击球", "跳发/上手发球触手高度标志练习"),
    "E06": ("扣球要全力起跳，在空中最高点完成进攻", "不持球助跑起跳摸高：连续15次"),
    "E07": ("击球点保持在头上方前倾位置，不要压到肩下", "原地挥臂打固定球：击球点高过头"),
    "E08": ("挥臂要鞭打发力：大臂带小臂甩手腕", "对墙快速甩臂打绳结练习"),
    "E09": ("拦网双臂伸直举过头顶，手指张开绷紧", "贴网举手指网练习：手过网沿"),
    "E10": ("拦网要与扣球人同步起跳，不要早跳晚跳", "口令起跳拦网节奏练习"),
    "E11": ("先屈膝下蹲蓄力，用腿发力起跳或移动", "半蹲跳起徒手拦网15次×3组"),
    "E12": ("保持身体微微前倾，重心落在前脚掌", "准备姿势定住：前倾15度30秒×5组"),
    "E13": ("双脚开立与肩同宽，站稳准备姿势", "准备姿势左右滑步保持站宽"),
    "E14": ("击球时重心保持稳定，不要上下晃动", "低位稳定垫固定球20次"),
    "E15": ("垫球双手叠握并拢，手腕下压形成平面", "夹臂持球旋转手腕定型练习"),
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
