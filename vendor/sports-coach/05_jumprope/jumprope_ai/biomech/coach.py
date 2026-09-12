# -*- coding: utf-8 -*-
"""跳绳教学话术生成：由规则引擎的 ErrorItem 驱动，逐错误码映射固定教学模板。"""
from typing import Dict

from .rules import Assessment

COACH_DB: Dict[str, tuple] = {
    "E01": ("挺胸抬头收下巴，肩向后展，不要含胸驼背", "靠墙站立：后脑勺/肩/臀贴墙30秒×5组"),
    "E02": ("手放低：大臂自然下垂，手柄保持在髋部两侧", "两手贴髋侧摇空绳练习，手不上移"),
    "E03": ("摇绳用手腕发力，大臂夹紧身体两侧不要张开", "腋下夹纸巾摇绳50次，纸巾不掉"),
    "E04": ("前脚掌快速点地过渡，不要一直踮着脚尖漂浮", "原地快节奏点地跳：听落地声找节奏"),
    "E05": ("起跳再高一点、晚一点过绳，小跳即可不要太高", "低跳定点：连续小跳保持绳速"),
    "E06": ("双摇要跳得更高：深蹲蓄力全力起跳", "高抬腿纵跳摸高练习，找双摇腾空感"),
    "E07": ("落地屈膝缓冲，膝盖不要绷直着地", "落地无声练习：轻落地屈膝下沉"),
    "E08": ("节奏要匀：每次跳跃间隔保持一致", "跟节拍器/音乐跳，稳定1分钟×5组"),
    "E09": ("变速要渐进过渡，快慢切换不要突然顿挫", "30秒快慢交替：渐快-渐慢过渡练习"),
    "E10": ("双脚同时起跳落地，不要一前一后", "并脚跳：双踝绑带同步跳30秒×5组"),
    "E11": ("膝盖保持微屈弹性，不要绷直腿跳", "微屈膝弹跳练习：膝盖像弹簧"),
    "E12": ("上身保持中正，不要左右摇晃借力", "对镜跳绳：肩部对齐固定标记"),
    "E13": ("抬头目视前方，用余光感知绳的位置", "看前方固定点跳绳30秒×5组"),
    "E14": ("摇绳频率要与跳跃匹配：双摇一跳两摇", "单摇-双摇分解衔接练习"),
    "E15": ("手腕小幅度捻动发力，不要大臂抡绳", "手腕捻绳计数练习：幅度递减"),
}

SEV_WORD = {"轻": "轻微", "中": "明显", "重": "严重"}


def coach_full(a: Assessment) -> str:
    if not a.valid:
        return f"[{a.cls_name}] 暂无法评估：{a.invalid_reason}"
    head = f"[{a.cls_name}] 动作得分 {a.score:.0f}/100"
    if a.n_hops:
        head += f"（本次识别 {a.n_hops} 跳，节奏 {a.tempo_spm:.0f} 跳/分）"
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
