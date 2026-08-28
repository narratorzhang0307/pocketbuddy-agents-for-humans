"""桩动作分析提供方（任务 4.2，需求 3.2）。

在外部模型就绪前返回可配置的确定性结果，使训练 → 分析 → 纠正 → 报告链路
可端到端运行。支持两种模式：
- 固定结果：始终返回构造时给定的结果。
- 序列结果：按调用次序循环返回预设结果列表（便于演示"标准/不标准"交替）。

帧数不足时（frame_count < 5 且未显式给定结果）返回 inconclusive（需求 4.5 演示）。
"""

from __future__ import annotations

from itertools import cycle
from typing import Iterable

from app.models.enums import ConfidenceLevel, FormStatus
from app.models.schemas import ProblemArea
from app.providers.form_analysis.base import FormAnalysisResult, FormContext

MIN_CONCLUSIVE_FRAMES = 5


class StubFormProvider:
    """Form_Analysis_Provider 的桩实现。"""

    def __init__(self, results: Iterable[FormAnalysisResult] | None = None) -> None:
        self._sequence = list(results) if results else None
        self._iter = cycle(self._sequence) if self._sequence else None

    def analyze(self, context: FormContext) -> FormAnalysisResult:
        # 预设序列优先：用于演示标准/不标准交替。
        if self._iter is not None:
            return next(self._iter)

        # 默认启发式：帧数不足则 inconclusive（需求 4.5）。
        if context.frame_count and context.frame_count < MIN_CONCLUSIVE_FRAMES:
            return FormAnalysisResult(
                is_standard=False,
                confidence=ConfidenceLevel.LOW,
                problem_areas=[],
                status=FormStatus.INCONCLUSIVE,
            )

        # 默认返回"标准"，演示正向路径。
        return FormAnalysisResult(
            is_standard=True,
            confidence=ConfidenceLevel.MEDIUM,
            problem_areas=[],
            status=FormStatus.CONCLUSIVE,
        )


def make_demo_provider() -> StubFormProvider:
    """构造一个标准/不标准交替的演示用桩，便于跑通纠正与报告。"""
    return StubFormProvider(
        results=[
            FormAnalysisResult(
                is_standard=True, confidence=ConfidenceLevel.HIGH
            ),
            FormAnalysisResult(
                is_standard=False,
                confidence=ConfidenceLevel.HIGH,
                problem_areas=[
                    ProblemArea(area="knee_valgus", severity=ConfidenceLevel.HIGH)
                ],
                status=FormStatus.CONCLUSIVE,
            ),
        ]
    )
