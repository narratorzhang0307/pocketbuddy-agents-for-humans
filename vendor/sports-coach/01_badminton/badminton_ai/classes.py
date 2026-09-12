# -*- coding: utf-8 -*-
"""羽毛球独立AI教学模型 —— 类别表 / 关键点定义 / 错误码表（全工程唯一事实来源）"""

# ---- 动作类别（本模型只认这6类，独立于其他运动模型）----
CLASS_NAMES = ("其他/背景", "高远球", "平抽", "扣杀", "挑球", "发球")
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

# 左右镜像配对（镜像增强用）
LR_PAIRS = ((L_EYE, R_EYE), (L_EAR, R_EAR), (L_SHOULDER, R_SHOULDER),
            (L_ELBOW, R_ELBOW), (L_WRIST, R_WRIST), (L_HIP, R_HIP),
            (L_KNEE, R_KNEE), (L_ANKLE, R_ANKLE))

# ---- 动作错误码（纠错话术全部由这些码驱动，禁止超出该词表的"幻觉教学"）----
ERROR_CODES = {
    "E01": "击球点过低",
    "E02": "击球点偏后（肩后方击球）",
    "E03": "引拍阶段肘部未抬起",
    "E04": "挥拍幅度不足（大小臂折叠未展开）",
    "E05": "击球瞬间手腕闪动不足",
    "E06": "转体不充分",
    "E07": "击球时重心起伏过大",
    "E08": "弓步膝盖超过脚尖",
    "E09": "弓步深度不足（步伐不到位）",
    "E10": "发球击球点过腰（违例风险）",
    "E11": "发力链脱节（肩-肘-腕时序紊乱）",
    "E12": "击球后未回中",
    "E13": "准备站姿过窄/过宽",
    "E14": "非持拍手臂未抬起（平衡缺失）",
    "E15": "腾空/起跳时机不当",
}
ERROR_LIST = tuple(ERROR_CODES.keys())
CODE_TO_ID = {c: i for i, c in enumerate(ERROR_LIST)}
NUM_ERRORS = len(ERROR_LIST)

# 各动作适用的错误子集（规则引擎按类别裁剪检查项）
CLASS_ERRORS = {
    "高远球": ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E12", "E13", "E14"],
    "平抽":   ["E01", "E02", "E04", "E05", "E06", "E07", "E11", "E12", "E13", "E14"],
    "扣杀":   ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E14", "E15"],
    "挑球":   ["E01", "E02", "E04", "E05", "E08", "E09", "E12", "E13"],
    "发球":   ["E01", "E04", "E05", "E10", "E13", "E14", "E07"],
}
