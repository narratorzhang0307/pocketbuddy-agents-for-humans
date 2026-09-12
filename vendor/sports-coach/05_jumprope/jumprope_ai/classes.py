# -*- coding: utf-8 -*-
"""跳绳独立AI教学模型 —— 类别表 / 关键点定义 / 错误码表（本工程唯一事实来源）"""

# ---- 动作类别（本模型只认这5类，独立于其他运动模型）----
CLASS_NAMES = ("其他/背景", "单摇", "双摇", "变速跳", "不规范跳跃")
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
    "E01": "体态驼背（含胸低头）",
    "E02": "抬手过高（手位应保持髋侧）",
    "E03": "摇绳靠手臂（大臂张开）",
    "E04": "全程踮脚漂浮（无落地过渡）",
    "E05": "起跳腾空不足",
    "E06": "双摇腾空高度不足",
    "E07": "落地缓冲不足（直腿落地）",
    "E08": "节奏不稳（跳速忽快忽慢）",
    "E09": "变速过渡生硬",
    "E10": "双脚起跳不同步",
    "E11": "屈膝不足（腿部僵硬）",
    "E12": "上身左右晃动",
    "E13": "低头看脚",
    "E14": "摇绳与跳跃脱节（频率不匹配）",
    "E15": "手腕发力不足（抡臂幅度过大）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())
CODE_TO_ID = {c: i for i, c in enumerate(ERROR_LIST)}
NUM_ERRORS = len(ERROR_LIST)

# 各动作适用的错误子集（规则引擎按类别裁剪检查项）
CLASS_ERRORS = {
    "单摇":     ["E01", "E02", "E03", "E04", "E05", "E07", "E08", "E10", "E11", "E13", "E15"],
    "双摇":     ["E01", "E02", "E03", "E06", "E07", "E08", "E10", "E11", "E13", "E14", "E15"],
    "变速跳":   ["E01", "E02", "E03", "E04", "E05", "E07", "E09", "E10", "E11", "E13"],
    "不规范跳跃": ["E01", "E04", "E05", "E07", "E08", "E10", "E11", "E12", "E13"],
}
