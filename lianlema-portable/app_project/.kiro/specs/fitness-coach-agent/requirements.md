# Requirements Document

## Introduction

"练了吗"（lian_le_ma）是一款 **AI 健身教练 iOS App**。核心价值由两条主线构成：

1. **摄像头动作纠错**：在训练中识别用户动作是否标准并给出可执行的纠正建议（首版支持深蹲、弓步蹲、推举、俯卧撑四个动作）。
2. **情绪价值**：在合适时机以真人音色语音给予鼓励，帮助用户坚持训练。

围绕这两条主线，本期还提供新用户运动评估、7 天训练计划生成、语音命令控制、训练后报告、会员付费墙、隐私与授权管理等支撑能力。

**关键架构决策——动作识别模型是外部依赖，本系统先搭建模型之外的全部能力**：动作/姿态识别模型由独立的 Model_Team 开发与维护。本系统不实现该模型，也不自行进行生物力学判断或对动作标准度做权威判定。本系统的职责边界是：定义一个稳定契约的 Form_Analysis_Provider 接口，用于接收结构化的 Form_Analysis_Result（动作类型、`is_standard` 判定、问题部位/角度、置信度），再将该结果转换为面向用户的自然语言纠正建议，并据此触发情绪鼓励。模型未就绪期间，该接口由 Stub_Form_Provider 桩实现占位；模型就绪后以实现同一接口的方式接入，不改调用方。这样既能让周边支撑能力先行落地，也能规避由本系统对动作标准度做权威判断而带来的运动受伤责任风险。

本需求文档定义学员端 App（iOS 移动客户端 + 后端服务）的功能性与质量需求，聚焦于用户价值与可验证的功能行为，具体技术实现在设计阶段细化。

**MVP 范围说明**：
- 本期聚焦"AI 健身教练的周边支撑能力 + 动作分析结果的消费与反馈生成"，**不实现动作识别模型本身**，仅通过稳定契约消费其结构化输出，模型未就绪期间由 Stub_Form_Provider 占位。
- 运动评估、1RM 估算与 7 天训练计划生成由**确定性纯函数模块**产出，其最终结果 SHALL NOT 由 LLM 生成或修改。
- LLM（经 OpenRouter 接入 Claude）仅用于自然语言文本（纠正反馈措辞、鼓励文案、报告叙述）的生成或润色，且不可用时回退模板。
- 鼓励语音经 ElevenLabs TTS 合成真人音色，合成失败降级为文本，相同文本的合成结果做缓存。
- MVP **不实现用户身份认证**（无登录、无 Sign in with Apple），User_Profile 通过本地保存的 `user_id` 关联；对应安全限制在 Requirement 14 中显式声明，正式上线前必须补足。

## Glossary

- **System（系统）**：指"练了吗"学员端整体，包含 iOS 移动客户端与后端服务。
- **Mobile_Client（移动客户端）**：运行在学员 iPhone 上的 App 前端，负责信息采集、训练界面展示、摄像头采集、语音命令识别、纠正反馈呈现与鼓励语音/文本播放。
- **Backend_Service（后端服务）**：服务端应用，负责业务编排、数据持久化、接收并消费动作分析结果、产出纠正反馈、鼓励内容与训练后报告。
- **Model_Team（模型团队）**：独立于本系统、负责开发与维护动作识别模型的团队，不在本系统职责范围内。
- **Form_Recognition_Model（动作识别模型）**：由 Model_Team 提供的外部依赖，负责从摄像头识别用户动作并输出结构化 Form_Analysis_Result。本系统不实现该模型，也不复核其生物力学判断。
- **Form_Analysis_Provider（动作分析提供方接口）**：本系统定义的稳定契约接口，用于接收针对 Supported_Movement 的 Form_Analysis_Result。真实模型与桩实现均实现该接口，调用方不感知差异。
- **Stub_Form_Provider（动作分析桩实现）**：在 Form_Recognition_Model 未就绪期间实现 Form_Analysis_Provider 接口、产出符合同一契约的 Form_Analysis_Result 的占位实现。
- **Form_Analysis_Result（动作分析结果）**：经 Form_Analysis_Provider 接收的结构化结果，至少包含动作类型（Supported_Movement）、`is_standard` 布尔判定、问题项列表（每项含涉及的身体部位与角度偏差）、置信度 `confidence`（`low`/`medium`/`high`）与时间戳。是本系统消费的输入契约。
- **Supported_Movement（支持动作）**：首版动作纠错支持的动作枚举，取值为 `squat`（深蹲）、`lunge`（弓步蹲）、`overhead_press`（推举）、`push_up`（俯卧撑）之一。
- **Coaching_Feedback_Generator（纠正反馈生成器）**：本系统组件，将 Form_Analysis_Result 转换为面向用户的自然语言纠正建议，不自行判定动作标准度。
- **Encouragement_Provider（鼓励提供器）**：在 Encouragement_Trigger 触发时产出鼓励文本的组件。
- **Voice_Engine（语音引擎）**：经 ElevenLabs TTS 将鼓励文本合成为真人音色音频的组件，含失败降级与按文本缓存能力。
- **Voice_Command_Recognizer（语音命令识别器）**：将训练中的语音输入识别为固定意图集中的某个 Voice_Command_Intent 的组件。
- **Voice_Command_Intent（语音命令意图）**：固定意图集中的枚举值，取值为 `pause`（暂停）、`resume`（继续）、`switch_movement`（换动作）、`lower_difficulty`（降低难度）、`repeat`（再说一遍）、`end_session`（结束训练）之一。
- **Fitness_Assessment（运动评估）**：新用户提交的评估输入集合，包含 Training_Goal、Training_Venue、Available_Equipment、Weekly_Frequency 与 Injury_Risk_Self_Assessment。
- **Training_Goal（训练目标）**：枚举值之一，包含 `fat_loss`（减脂）、`hypertrophy`（增肌）、`strength`（最大力量）、`endurance`（耐力）。
- **Training_Venue（训练场地）**：枚举值之一，包含 `home`（家庭）、`gym`（健身房）、`outdoor`（户外）。
- **Available_Equipment（可用器械）**：学员从预定义器械清单中选择的零至多项可用器械集合。
- **Weekly_Frequency（每周训练频率）**：学员每周计划训练的次数，取值为 1 至 7 的整数。
- **Injury_Risk_Self_Assessment（伤痛风险自评）**：学员为预定义身体部位清单中每个部位选择的风险等级集合，每项风险等级取值为 `none`（无）、`mild`（轻度）、`severe`（重度）之一；属于敏感健康信息。
- **User_Profile（用户档案）**：以 `user_id` 关联的持久化用户记录，聚合该用户的 Fitness_Assessment、可选的 Recent_Lift_Sample、训练计划与训练记录。
- **Recent_Lift_Sample（近期负重样本）**：用户可选填写的"某动作以重量 W 完成 R 次"的历史样本，用于在力量类目标下估算 1RM。
- **1RM**：单次最大重复重量（One Rep Max），表示某个动作只能完成一次的最大负重。
- **Strength_Assessor（力量评估器）**：基于确定性公式的可选模块，仅在满足条件时由 Recent_Lift_Sample 反推 1RM 估算。
- **Plan_Generator（计划生成器）**：基于 Fitness_Assessment 的确定性模块，输出 Seven_Day_Plan。
- **Seven_Day_Plan（7 天训练计划）**：覆盖 7 天的训练计划，每天为训练日或休息日，训练日包含若干动作及其参数。
- **Training_Session（训练会话）**：一次完整的训练过程，包含若干动作组与对应的 Form_Analysis_Result 及反馈数据。
- **Encouragement_Trigger（鼓励时机）**：依据训练状态变化判定应输出鼓励内容的事件。
- **Training_Report（训练后报告）**：一次 Training_Session 结束后生成的报告，包含 Form_Score、风险提示、纠正次数与下一次训练重点。
- **Form_Score（动作分）**：由一次 Training_Session 内的 Form_Analysis_Result 集合确定性计算出的动作质量评分。
- **Paywall（付费墙）**：在免费次数用尽且未持有 Pro_Entitlement 时向用户展示的付费引导界面。
- **Free_Usage_Limit（免费次数限制）**：免费用户可开启 Training_Session 的次数上限。
- **Pro_Entitlement（Pro 权益）**：通过 Apple IAP 购买后解锁的会员权益。
- **Apple_IAP（应用内购买）**：经 Apple StoreKit 完成的应用内购买与恢复购买机制。
- **Camera_Permission（摄像头权限）**：iOS 摄像头访问授权。
- **Microphone_Permission（麦克风权限）**：iOS 麦克风访问授权。
- **HealthKit_Permission（HealthKit 权限）**：iOS HealthKit 健康数据读写授权。
- **Data_Store（数据存储）**：持久化 User_Profile、Fitness_Assessment、Recent_Lift_Sample、训练计划、训练记录与训练报告的数据库。
- **Secret_Manager（密钥管理器）**：负责读取与提供第三方服务凭证的组件。

## Requirements

### Requirement 1: 新用户运动评估

**User Story:** 作为新用户，我希望填写我的训练目标、训练场地、可用器械、每周训练频率与伤痛风险自评，以便系统据此为我生成贴合我条件且安全的训练计划。

#### Acceptance Criteria

1. WHEN 新用户提交运动评估表单，THE Mobile_Client SHALL 采集 Training_Goal、Training_Venue、Available_Equipment、Weekly_Frequency 与 Injury_Risk_Self_Assessment 五类输入。
2. THE Training_Goal 取值 SHALL 限定为 `fat_loss`、`hypertrophy`、`strength`、`endurance` 之一。
3. THE Training_Venue 取值 SHALL 限定为 `home`、`gym`、`outdoor` 之一。
4. WHEN 学员选择可用器械，THE Mobile_Client SHALL 允许学员从预定义器械清单中选择零至多项 Available_Equipment。
5. THE Weekly_Frequency 取值 SHALL 为 1 至 7 的整数。
6. WHEN 学员填写伤痛风险自评，THE Mobile_Client SHALL 允许学员为预定义身体部位清单中的每个部位选择一个风险等级（`none`、`mild` 或 `severe`）。
7. WHEN 采集 Injury_Risk_Self_Assessment 前，THE Mobile_Client SHALL 依据 Requirement 10 取得对该类敏感健康信息的单独明确同意。
8. IF Training_Goal、Training_Venue 或 Weekly_Frequency 中任一必填类别缺失，THEN THE Mobile_Client SHALL 阻止提交并标识缺失的类别。
9. IF Weekly_Frequency 取值超出 1 至 7 的范围，THEN THE Mobile_Client SHALL 拒绝该取值并提示有效范围。
10. WHEN 运动评估通过校验，THE Backend_Service SHALL 将 Fitness_Assessment 写入 Data_Store 并与 `user_id` 关联。
11. WHEN Fitness_Assessment 写入成功，THE Backend_Service SHALL 返回唯一的 `user_id`。

### Requirement 2: 可选 1RM 力量评估

**User Story:** 作为以力量为目标的学员，我希望在我提供历史负重数据时获得 1RM 估算，以便训练计划能给出更贴合我当前水平的负重建议。

#### Acceptance Criteria

1. WHEN 学员填写 Recent_Lift_Sample，THE Mobile_Client SHALL 采集动作、重量、单位（`kg` 或 `lb`）与完成次数。
2. IF Recent_Lift_Sample 的重量为非正数或完成次数超出 1 至 12 的范围，THEN THE Mobile_Client SHALL 拒绝该字段并提示有效范围。
3. WHERE Fitness_Assessment 的 Training_Goal 为 `strength` 且学员提供了至少一个 Recent_Lift_Sample，THE Strength_Assessor SHALL 由该样本估算对应动作的 1RM 数值。
4. WHERE Training_Goal 不为 `strength`，或学员未提供 Recent_Lift_Sample，THE Strength_Assessor SHALL 跳过 1RM 估算并将 1RM 标记为不适用（`not_applicable`）。
5. THE Strength_Assessor SHALL 使用 Epley 或 Brzycki 公式由 Recent_Lift_Sample 反推 1RM。
6. THE Strength_Assessor SHALL 为每个 1RM 估算结果附带重量单位（`kg` 或 `lb`）与置信度 `confidence`（`low`、`medium` 或 `high`）。
7. THE Strength_Assessor SHALL 由确定性公式产生 1RM 估算结果，且 1RM 数值 SHALL NOT 由 LLM 生成。
8. WHEN 1RM 估算完成，THE Backend_Service SHALL 将估算结果与 `user_id` 一起写入 Data_Store。

### Requirement 3: 7 天训练计划生成

**User Story:** 作为学员，我希望根据我的运动评估获得一份尊重我的场地、器械、每周频率与伤痛情况的 7 天训练计划，以便安全且有针对性地训练。

#### Acceptance Criteria

1. WHEN Fitness_Assessment 可用，THE Plan_Generator SHALL 基于 Fitness_Assessment 生成一份 Seven_Day_Plan。
2. THE Seven_Day_Plan SHALL 包含 7 个按日索引的条目，每个条目标记为训练日或休息日。
3. THE Plan_Generator SHALL 使 Seven_Day_Plan 中训练日的数量等于 Fitness_Assessment 中的 Weekly_Frequency。
4. THE Plan_Generator SHALL 仅编排可由 Available_Equipment 与 Training_Venue 支持的动作。
5. WHERE Injury_Risk_Self_Assessment 中某身体部位的风险等级为 `severe`，THE Plan_Generator SHALL 规避主要负荷该身体部位的动作。
6. WHERE Injury_Risk_Self_Assessment 中某身体部位的风险等级为 `mild`，THE Plan_Generator SHALL 为主要负荷该身体部位的动作提供降阶（regression）替代。
7. THE Plan_Generator SHALL 为每个训练日的每个动作输出动作名称、组数、每组次数与组间休息秒数。
8. WHERE 某动作对应的 1RM 估算可用，THE Plan_Generator SHALL 为该动作附带以 1RM 百分比表示的建议负重，且满足 `0 < load_pct_of_1rm ≤ 1`。
9. WHERE 某动作使用的 1RM 估算 `confidence` 为 `low`，THE Plan_Generator SHALL 在该动作上附带"从较轻重量开始并根据实际感受自行调整"的安全提示。
10. THE Plan_Generator SHALL 由确定性逻辑产生 Seven_Day_Plan，且计划内容 SHALL NOT 由 LLM 生成或修改。
11. WHEN Seven_Day_Plan 生成完成，THE Backend_Service SHALL 将计划与 `user_id` 一起写入 Data_Store。
12. WHEN 学员请求查看训练计划，THE Mobile_Client SHALL 展示该学员当前的 Seven_Day_Plan，并展示步骤 9 中的安全提示（如存在）。

### Requirement 4: 摄像头动作纠错——动作分析提供方契约与桩实现

**User Story:** 作为本系统，我希望通过稳定契约的 Form_Analysis_Provider 接口接收动作分析结果，并在模型未就绪时由 Stub_Form_Provider 占位，以便在不改调用方的前提下后续接入真实模型。

#### Acceptance Criteria

1. THE Backend_Service SHALL 定义 Form_Analysis_Provider 契约接口，用于接收针对 Supported_Movement 的 Form_Analysis_Result。
2. THE Supported_Movement 取值 SHALL 限定为 `squat`、`lunge`、`overhead_press`、`push_up` 之一。
3. THE Form_Analysis_Result 契约 SHALL 至少包含动作类型、`is_standard` 布尔判定、问题项列表（每项含身体部位与角度偏差描述）、置信度 `confidence`（`low`、`medium` 或 `high`）与时间戳。
4. THE Backend_Service SHALL 以 Form_Analysis_Result 中的 `is_standard` 判定作为动作标准度的唯一来源。
5. THE System SHALL NOT 由 LLM 判定动作是否标准。
6. WHEN Form_Analysis_Provider 接收到 Form_Analysis_Result，THE Backend_Service SHALL 依据契约校验各字段的类型与取值范围。
7. IF 接收到的 Form_Analysis_Result 缺少必填字段或字段取值非法，THEN THE Backend_Service SHALL 拒绝该结果并返回数据格式错误。
8. WHERE Form_Recognition_Model 尚未就绪，THE Stub_Form_Provider SHALL 实现 Form_Analysis_Provider 接口并产出符合同一契约的 Form_Analysis_Result。
9. WHEN Form_Recognition_Model 就绪，THE System SHALL 以实现同一 Form_Analysis_Provider 接口的方式接入真实模型，并保持 Form_Analysis_Provider 的调用方不变。
10. WHEN 接收到通过校验的 Form_Analysis_Result，THE Backend_Service SHALL 将其与对应的 Training_Session 关联并写入 Data_Store。

### Requirement 5: 动作纠正反馈生成

**User Story:** 作为学员，我希望系统把动作分析结果转换成易懂的纠正建议，以便我及时调整动作、避免受伤。

#### Acceptance Criteria

1. WHEN Backend_Service 获得一条通过校验的 Form_Analysis_Result，THE Coaching_Feedback_Generator SHALL 基于该结果生成面向用户的自然语言纠正反馈。
2. IF Form_Analysis_Result 的 `is_standard` 为 `false`，THEN THE Coaching_Feedback_Generator SHALL 针对结果中列出的每个问题项生成至少一条指向具体身体部位与调整方向的纠正建议。
3. WHERE Form_Analysis_Result 的 `is_standard` 为 `true`，THE Coaching_Feedback_Generator SHALL 输出正向确认反馈。
4. WHERE Form_Analysis_Result 的 `confidence` 为 `low`，THE Coaching_Feedback_Generator SHALL 在反馈中附带不确定性提示。
5. THE Coaching_Feedback_Generator SHALL 在保持 Form_Analysis_Result 的 `is_standard` 判定不变的前提下，仅生成解释性与建议性文本。
6. WHERE 启用 LLM 文本润色，THE Coaching_Feedback_Generator SHALL 仅使用 LLM 优化反馈文本的措辞，且 IF LLM 不可用，THEN THE Coaching_Feedback_Generator SHALL 回退到模板生成的反馈文本。
7. WHEN 纠正反馈生成完成，THE Backend_Service SHALL 将反馈文本与对应的 Form_Analysis_Result 及 Training_Session 关联存储。
8. WHEN 某条 Form_Analysis_Result 满足 Requirement 8 中定义的 Encouragement_Trigger 条件，THE Backend_Service SHALL 触发鼓励内容的产出。

### Requirement 6: 语音命令识别

**User Story:** 作为正在训练的学员，我希望通过语音下达固定命令，以便在不腾出双手的情况下控制训练。

#### Acceptance Criteria

1. THE Voice_Command_Recognizer SHALL 支持固定意图集 Voice_Command_Intent：`pause`、`resume`、`switch_movement`、`lower_difficulty`、`repeat`、`end_session`，分别对应暂停、继续、换动作、降低难度、再说一遍、结束训练。
2. WHEN Voice_Command_Recognizer 以不低于置信度阈值识别出固定意图集中的某个意图，THE Mobile_Client SHALL 执行该意图对应的训练控制动作。
3. WHEN 学员发出固定意图集中的命令且被成功识别，THE Mobile_Client SHALL 在命令结束后 500 毫秒内执行对应的训练控制动作。
4. IF 识别出的意图置信度低于置信度阈值，THEN THE Mobile_Client SHALL 保持当前训练状态并提示学员重述命令。
5. IF 语音输入未匹配固定意图集中的任何意图，THEN THE Mobile_Client SHALL 忽略该输入并保持当前训练状态。
6. WHEN 学员发出 `repeat`（再说一遍）意图，THE Mobile_Client SHALL 重新呈现最近一次的纠正反馈或鼓励内容。
7. WHERE 语音识别在设备端完成，THE Mobile_Client SHALL 仅在设备本地处理原始语音音频。
8. IF Microphone_Permission 未被授予，THEN THE Mobile_Client SHALL 停用语音命令识别并提供等效的手动控制入口。

### Requirement 7: 训练后报告

**User Story:** 作为完成训练的学员，我希望获得一份训练后报告，包含动作分、风险提示、纠正次数与下一次训练重点，以便了解本次表现并为下次训练做准备。

#### Acceptance Criteria

1. WHEN 一次 Training_Session 结束，THE Backend_Service SHALL 生成一份 Training_Report。
2. THE Training_Report SHALL 包含 Form_Score、风险提示、纠正次数与下一次训练重点四项内容。
3. THE Backend_Service SHALL 由本次 Training_Session 内的 Form_Analysis_Result 集合以确定性方式计算 Form_Score。
4. THE Backend_Service SHALL 将纠正次数计为本次 Training_Session 内 `is_standard` 为 `false` 的 Form_Analysis_Result 数量。
5. WHERE 本次 Training_Session 内存在涉及 Injury_Risk_Self_Assessment 已标记部位的问题项，THE Training_Report SHALL 输出对应的风险提示。
6. THE Backend_Service SHALL 以确定性逻辑计算 Form_Score、纠正次数与风险提示，且这些数值 SHALL NOT 由 LLM 生成。
7. WHERE 启用 LLM 文本增强，THE System SHALL 仅将 LLM 用于"下一次训练重点"叙述性文本的润色，且 IF LLM 不可用，THEN THE System SHALL 回退到模板文本。
8. WHEN Training_Report 生成完成，THE Backend_Service SHALL 将报告与对应的 Training_Session 及 `user_id` 关联存储。
9. WHEN 学员请求查看训练报告，THE Mobile_Client SHALL 展示该次 Training_Session 的 Training_Report。

### Requirement 8: 拟人化鼓励语音（情绪价值）

**User Story:** 作为学员，我希望在合适时机听到真人音色的鼓励，以便获得情绪价值并坚持完成训练。

#### Acceptance Criteria

1. THE System SHALL 将以下事件识别为 Encouragement_Trigger：完成一组动作、当前组完成次数达到目标的最后一次、连续三次 Form_Analysis_Result 的 `is_standard` 为 `true`、Training_Session 结束。
2. WHEN Encouragement_Trigger 触发，THE Encouragement_Provider SHALL 产出与当前训练状态匹配的鼓励文本。
3. WHEN Encouragement_Provider 产出鼓励文本，THE Voice_Engine SHALL 经 ElevenLabs TTS 将该文本合成为真人音色音频并返回可访问的 `audio_url`。
4. IF ElevenLabs TTS 合成失败，THEN THE Encouragement_Provider SHALL 回退为返回鼓励文本并将 `audio_url` 置空。
5. WHEN Mobile_Client 收到包含 `audio_url` 的鼓励响应，THE Mobile_Client SHALL 通过音频播放器播放该音频。
6. IF 鼓励响应不含可用的 `audio_url`，THEN THE Mobile_Client SHALL 以文本形式展示鼓励内容。
7. WHERE 某段鼓励文本此前已成功合成音频，THE Voice_Engine SHALL 返回缓存的音频结果而不重复调用 ElevenLabs TTS。
8. WHERE 启用 LLM 文本增强，THE Encouragement_Provider SHALL 仅将 LLM 用于鼓励文本生成，且 IF LLM 不可用，THEN THE Encouragement_Provider SHALL 回退到模板文案。

### Requirement 9: 会员付费墙与应用内购买

**User Story:** 作为产品负责人，我希望通过免费次数限制与 Pro 权益的付费墙促成订阅，并使用 Apple IAP 完成购买，以便实现商业化。

#### Acceptance Criteria

1. THE System SHALL 为免费用户设定 Free_Usage_Limit。
2. WHILE 免费用户的已用训练次数低于 Free_Usage_Limit，THE System SHALL 允许该用户开启 Training_Session。
3. IF 免费用户的已用训练次数达到 Free_Usage_Limit 且未持有 Pro_Entitlement，THEN THE Mobile_Client SHALL 展示 Paywall 并阻止开启新的 Training_Session。
4. WHERE 用户持有有效的 Pro_Entitlement，THE System SHALL 解除 Free_Usage_Limit 限制并解锁 Pro 权益。
5. WHEN 用户在 Paywall 发起购买，THE Mobile_Client SHALL 通过 Apple_IAP（StoreKit）完成交易。
6. WHEN Apple_IAP 交易成功，THE Mobile_Client SHALL 为当前设备授予 Pro_Entitlement。
7. WHEN 用户触发恢复购买，THE Mobile_Client SHALL 通过 StoreKit 在当前 Apple ID 下恢复既有的 Pro_Entitlement。
8. WHERE MVP 阶段无账号体系，THE System SHALL 将 Pro_Entitlement 与设备及其登录的 Apple ID 关联，而非与 `user_id` 关联。
9. IF Pro_Entitlement 仅存在于其他设备或其他 Apple ID，THEN THE Mobile_Client SHALL 引导用户在当前设备使用同一 Apple ID 执行恢复购买以取得权益。

### Requirement 10: 隐私与授权

**User Story:** 作为注重隐私的用户，我希望分别授权摄像头、麦克风与 HealthKit，并对伤痛/健康等敏感信息单独同意，以便我能掌控我的数据。

#### Acceptance Criteria

1. WHERE 功能需要使用摄像头，THE Mobile_Client SHALL 在首次使用前单独请求 Camera_Permission。
2. WHERE 功能需要使用麦克风，THE Mobile_Client SHALL 在首次使用前单独请求 Microphone_Permission。
3. WHERE 功能需要读写健康数据，THE Mobile_Client SHALL 在首次使用前单独请求 HealthKit_Permission。
4. THE Mobile_Client SHALL 分别独立地请求 Camera_Permission、Microphone_Permission 与 HealthKit_Permission。
5. WHEN 采集 Injury_Risk_Self_Assessment 或其他敏感健康信息前，THE Mobile_Client SHALL 取得用户对该类敏感信息的单独明确同意。
6. IF Camera_Permission 未被授予，THEN THE Mobile_Client SHALL 停用摄像头动作纠错并提供可用的替代训练流程而保持稳定运行。
7. IF Microphone_Permission 未被授予，THEN THE Mobile_Client SHALL 停用语音命令并提供手动控制替代而保持稳定运行。
8. IF HealthKit_Permission 未被授予，THEN THE Mobile_Client SHALL 跳过健康数据读写并继续提供其余功能而保持稳定运行。
9. WHERE 用户已授予 HealthKit_Permission，THE Mobile_Client SHALL 仅在授权范围内读写 HealthKit 数据。
10. IF 用户撤销对敏感健康信息的同意，THEN THE System SHALL 停止采集该类敏感信息。

### Requirement 11: 训练记录持久化

**User Story:** 作为学员，我希望系统保存我的训练记录，以便我回顾训练历史并跟踪进步。

#### Acceptance Criteria

1. WHEN 一次 Training_Session 完成，THE Backend_Service SHALL 将该会话的动作组、关联的 Form_Analysis_Result、纠正反馈与 Training_Report 写入 Data_Store。
2. THE Backend_Service SHALL 将每条训练记录与 `user_id` 及时间戳关联存储。
3. WHEN 学员请求查看训练历史，THE Backend_Service SHALL 返回该学员按时间倒序排序的训练记录。
4. WHERE 运行环境为开发环境，THE Data_Store SHALL 使用 SQLite 进行持久化。
5. WHERE 运行环境为生产环境，THE Data_Store SHALL 使用 PostgreSQL 进行持久化。
6. THE Backend_Service SHALL 通过 Alembic 迁移管理 Data_Store 的 Schema。

### Requirement 12: 第三方服务凭证安全管理

**User Story:** 作为系统运维人员，我希望所有第三方服务密钥被安全管理，以便防止凭证泄露。

#### Acceptance Criteria

1. WHEN Backend_Service 需要访问第三方服务凭证，THE Secret_Manager SHALL 从环境变量或安全存储中读取该凭证。
2. THE System SHALL 将第三方服务凭证排除在源代码与版本控制之外。
3. THE System SHALL NOT 将第三方服务凭证写入 Data_Store。
4. IF 所需的第三方服务凭证缺失，THEN THE Secret_Manager SHALL 返回配置错误并阻止对应的服务调用。
5. WHEN 系统记录日志，THE Backend_Service SHALL 对第三方服务凭证值进行脱敏处理。

### Requirement 13: AI 能力边界与确定性约束

**User Story:** 作为产品负责人，我希望明确哪些能力必须由确定性逻辑产生、哪些可由 LLM 增强，以便保证安全与一致性并避免过度设计。

#### Acceptance Criteria

1. THE Fitness_Assessment 处理、Strength_Assessor、Plan_Generator 与 Training_Report 的数值计算 SHALL 由确定性纯函数模块产生最终结果。
2. THE 上述确定性模块的数值输出 SHALL NOT 由 LLM 生成或修改。
3. THE System SHALL NOT 使用 LLM 判定动作是否标准。
4. WHERE 启用 LLM 文本增强，THE System SHALL 仅将 LLM 用于自然语言文本（纠正反馈措辞、鼓励文案、报告叙述）的生成或润色。
5. WHERE 通过 LLM 网关接入模型，THE System SHALL 经由 OpenRouter 接入 Claude 模型。
6. IF LLM 调用失败或不可用，THEN THE System SHALL 回退到模板化文本输出并保留已完成的确定性结果。

### Requirement 14: MVP 身份与数据访问限制

**User Story:** 作为产品负责人，我希望 MVP 阶段在没有完整身份认证的前提下，明确数据访问的边界与未来计划，以便降低数据泄漏风险并规划上线前的必备工作。

#### Acceptance Criteria

1. THE MVP SHALL NOT 集成任何用户身份认证机制。
2. WHEN Backend_Service 接收到通过 `user_id` 的读写请求，THE Backend_Service SHALL 仅校验 `user_id` 存在而不进行授权判断。
3. THE System SHALL 在 README 中声明 MVP 未实现身份认证，并声明禁止部署到对外公网。
4. WHERE 后续启用正式上线，THE System SHALL 接入 Sign in with Apple 并将 `user_id` 与 Apple ID 绑定。
