# -*- coding: utf-8 -*-
"""足球教学话术生成：由规则引擎的 ErrorItem 驱动，逐错误码映射固定教学模板。"""
from typing import Dict

from .rules import Assessment

COACH_DB: Dict[str, tuple] = {
    "E01": ("支撑脚踩在球侧约一拳距离，脚尖对准出球方向", "摆一个球做支撑脚定点标记，反复落位10次×5组"),
    "E02": ("支撑腿微屈膝降重心，不要直腿发劲", "单腿微屈平衡站立30秒×5组"),
    "E03": ("上身前压住球，不要后仰，球才不会打飞", "对墙传球：刻意保持胸口前倾"),
    "E04": ("大腿后摆再前摆，加大摆腿幅度才有球速", "扶墙大幅度慢摆腿：前后各20次×3组"),
    "E05": ("触球瞬间加快摆腿速度，用髋带大腿鞭打", "绑弹力带摆腿+短距离对墙大力传球"),
    "E06": ("支撑脚全脚掌站稳，触球时不要离地", "触球瞬间支撑脚踩稳的定点射门练习"),
    "E07": ("重心降下来：屈膝沉髋再触球", "低位左右脚交替点球30秒×5组"),
    "E08": ("肩膀保持水平，身体不要侧倒", "张双臂走直线+肩上放矿泉水瓶慢走"),
    "E09": ("停球要卸力：触球瞬间脚顺势后撤缓冲", "对墙踢球接缓冲停球，一踢一停连续20次"),
    "E10": ("颠球脚背轻轻搓球，小腿摆动不要过大", "一脚着地一颠一接：幅度递减练习"),
    "E11": ("颠球节奏要匀，每次垫同样的高度", "数拍子颠球：固定节拍器节奏10个×5组"),
    "E12": ("触球后腿顺势前送，不要触完就收", "慢动作摆腿-触球-随摆分解练习"),
    "E13": ("带球抬头，用余光控球，眼睛看场上", "抬头带球绕杆+报出教练手势"),
    "E14": ("双脚开立与肩同宽，站稳下盘", "宽站姿左右脚交替踩球30秒×5组"),
    "E15": ("双臂张开保持平衡，不要夹臂", "张臂单腿闭眼站立30秒×5组"),
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
