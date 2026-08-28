"""动作分析提供方契约（任务 4.2，需求 3）。

定义 Form_Analysis_Provider 协议与其输入/输出结构。真实模型由模型团队按本协议
实现；本期用 Stub_Form_Provider 打通链路。服务层只依赖本协议，模型切换不改调用方。
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field

from app.models.enums import ConfidenceLevel, FormStatus, SupportedExercise
from app.models.schemas import ProblemArea


class InvalidFormResultError(ValueError):
    """Provider 返回结果缺少必要字段时抛出（需求 3.5 → 路由层 422）。"""


class FormContext(BaseModel):
    """动作分析的输入上下文。

    本期对桩实现而言，关键点为可选；真实模型实现可据 ``keypoints`` 等字段判定。
    保留 ``keypoints`` 为通用结构，避免过早绑定具体姿态格式。
    """

    exercise: SupportedExercise
    keypoints: list[dict] = Field(default_factory=list)
    frame_count: int = 0


class FormAnalysisResult(BaseModel):
    """动作分析的结构化输出（需求 3.1）。"""

    is_standard: bool
    confidence: ConfidenceLevel
    problem_areas: list[ProblemArea] = Field(default_factory=list)
    status: FormStatus = FormStatus.CONCLUSIVE


@runtime_checkable
class FormAnalysisProvider(Protocol):
    """动作标准度判定能力的契约接口。"""

    def analyze(self, context: FormContext) -> FormAnalysisResult: ...


def validate_result(result: FormAnalysisResult | dict) -> FormAnalysisResult:
    """校验 Provider 输出是否含必要字段（需求 3.5 / Property 5）。

    缺少 ``is_standard`` 或 ``confidence`` 时抛 :class:`InvalidFormResultError`，
    供路由层转为 422，而非静默忽略或抛未处理异常。
    """
    if isinstance(result, FormAnalysisResult):
        return result
    if not isinstance(result, dict):
        raise InvalidFormResultError("form analysis result must be a mapping")
    if "is_standard" not in result or result.get("is_standard") is None:
        raise InvalidFormResultError("missing required field: is_standard")
    if "confidence" not in result or result.get("confidence") is None:
        raise InvalidFormResultError("missing required field: confidence")
    try:
        return FormAnalysisResult.model_validate(result)
    except Exception as exc:  # noqa: BLE001 - 归一为契约错误
        raise InvalidFormResultError(str(exc)) from exc
