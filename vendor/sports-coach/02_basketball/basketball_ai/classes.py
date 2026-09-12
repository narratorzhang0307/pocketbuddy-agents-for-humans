# -*- coding: utf-8 -*-
"""篮球独立AI教学模型 —— 类别表 / 关键点定义 / 错误码表（本工程唯一事实来源）"""

# ---- 动作类别（本模型只认这6类，独立于其他运动模型）----
CLASS_NAMES = ("其他/背景", "运球", "三步上篮", "投篮", "传球", "防守姿势")
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
    "E01": "投篮出手点过低",
    "E02": "出手未压腕（跟随动作缺失）",
    "E03": "投篮肘部外展（肘未对筐）",
    "E04": "出手弧度不足",
    "E05": "起跳/出手重心前倾后仰",
    "E06": "腾空高度不足（未起跳）",
    "E07": "屈膝不足（下肢未发力）",
    "E08": "双脚起跳不同步",
    "E09": "运球手型僵硬（腕部无弹性）",
    "E10": "运球过高（腰以上）",
    "E11": "低头含胸（视线离开目标）",
    "E12": "上篮起跳腿膝未抬起",
    "E13": "重心过高（髋未下沉）",
    "E14": "站姿过窄/过宽",
    "E15": "重心横移失衡",
}
ERROR_LIST = tuple(ERROR_CODES.keys())
CODE_TO_ID = {c: i for i, c in enumerate(ERROR_LIST)}
NUM_ERRORS = len(ERROR_LIST)

# 各动作适用的错误子集（规则引擎按类别裁剪检查项）
CLASS_ERRORS = {
    "运球":     ["E09", "E10", "E11", "E13", "E14", "E15"],
    "三步上篮": ["E05", "E06", "E07", "E08", "E12", "E15"],
    "投篮":     ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08", "E15"],
    "传球":     ["E02", "E07", "E14", "E15"],
    "防守姿势": ["E07", "E11", "E13", "E14", "E15"],
}
