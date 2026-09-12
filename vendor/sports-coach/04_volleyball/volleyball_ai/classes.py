# -*- coding: utf-8 -*-
"""排球独立AI教学模型 —— 类别表 / 关键点定义 / 错误码表（本工程唯一事实来源）"""

# ---- 动作类别（本模型只认这5类，独立于其他运动模型）----
CLASS_NAMES = ("其他/背景", "垫球", "发球", "扣球", "拦网")
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
    "E01": "垫球手臂夹角过大（肘未伸直）",
    "E02": "垫球击球点不当（过高/过低）",
    "E03": "击球点偏侧（偏离身体中线）",
    "E04": "发球抛球不足（抛球过低）",
    "E05": "发球击球点过低",
    "E06": "扣球腾空不足（未起跳）",
    "E07": "扣球击球点不高",
    "E08": "扣球鞭打不足（挥臂速度低）",
    "E09": "拦网双臂未过头顶",
    "E10": "拦网腾空不足",
    "E11": "屈膝不足（蓄力不足）",
    "E12": "身体前倾不当（过直/过前）",
    "E13": "站姿过窄/过宽",
    "E14": "重心起伏过大",
    "E15": "垫球双手分离（手型未并拢）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())
CODE_TO_ID = {c: i for i, c in enumerate(ERROR_LIST)}
NUM_ERRORS = len(ERROR_LIST)

# 各动作适用的错误子集（规则引擎按类别裁剪检查项）
CLASS_ERRORS = {
    "垫球": ["E01", "E02", "E03", "E11", "E12", "E13", "E14", "E15"],
    "发球": ["E04", "E05", "E11", "E12", "E13", "E14"],
    "扣球": ["E06", "E07", "E08", "E11", "E14"],
    "拦网": ["E09", "E10", "E11", "E12", "E14"],
}
