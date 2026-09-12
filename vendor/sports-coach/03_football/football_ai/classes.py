# -*- coding: utf-8 -*-
"""足球独立AI教学模型 —— 类别表 / 关键点定义 / 错误码表（本工程唯一事实来源）"""

# ---- 动作类别（本模型只认这6类，独立于其他运动模型）----
CLASS_NAMES = ("其他/背景", "带球", "传球", "射门", "停球", "颠球")
NUM_CLASSES = len(CLASS_NAMES)

# ---- COCO-17 关键点 ----
KEYPOINT_NAMES = (
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
)
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHOULDER, R_SHOULDER = 5, 6
L_ELBOW, R_ELBOW = 7, 8
L_WRIST, R_WRIST = 9, 10
L_HIP, R_HIP = 11, 12
L_KNEE, R_KNEE = 13, 14
L_ANKLE, R_ANKLE = 15, 16
NUM_KEYPOINTS = 17

LR_PAIRS = ((L_EYE, R_EYE), (L_EAR, R_EAR), (L_SHOULDER, R_SHOULDER),
            (L_ELBOW, R_ELBOW), (L_WRIST, R_WRIST), (L_HIP, R_HIP),
            (L_KNEE, R_KNEE), (L_ANKLE, R_ANKLE))

# ---- 动作错误码（纠错话术全部由这些码驱动，禁止超出该词表的"幻觉教学"）----
ERROR_CODES = {
    "E01": "支撑脚站位不当（离球位过远/过近）",
    "E02": "支撑腿屈膝不足（直腿支撑）",
    "E03": "身体前后倾过度",
    "E04": "摆腿幅度不足",
    "E05": "触球发力不足（摆腿速度低）",
    "E06": "支撑脚离地不稳",
    "E07": "重心过高",
    "E08": "肩线侧倾过大",
    "E09": "停球未卸力（触球过硬）",
    "E10": "颠球摆腿过大",
    "E11": "颠球节奏不稳",
    "E12": "触球后无随摆（发力僵硬）",
    "E13": "低头盯球",
    "E14": "站姿过窄/过宽",
    "E15": "手臂未张开（平衡缺失）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())
CODE_TO_ID = {c: i for i, c in enumerate(ERROR_LIST)}
NUM_ERRORS = len(ERROR_LIST)

# 各动作适用的错误子集（规则引擎按类别裁剪检查项）
CLASS_ERRORS = {
    "带球": ["E07", "E13", "E14", "E15"],
    "传球": ["E01", "E02", "E03", "E04", "E05", "E12", "E14", "E15"],
    "射门": ["E01", "E02", "E03", "E04", "E05", "E06", "E12", "E14", "E15"],
    "停球": ["E02", "E07", "E08", "E09", "E14"],
    "颠球": ["E07", "E08", "E10", "E11", "E15"],
}
