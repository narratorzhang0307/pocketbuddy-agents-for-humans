"""评估仓储（任务 3.2，需求 1.6 / 1.7）。

负责 Assessment 领域模型与 ``AssessmentORM`` 表之间的转换与持久化。
仓储只做存取，不含业务规则。
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enums import InjuryRiskArea, TrainingGoal, Venue
from app.models.orm import AssessmentORM
from app.models.schemas import Assessment


def _to_model(row: AssessmentORM) -> Assessment:
    return Assessment(
        user_id=UUID(row.user_id),
        goal=TrainingGoal(row.goal),
        venue=Venue(row.venue),
        equipment=list(row.equipment or []),
        weekly_frequency=row.weekly_frequency,
        injury_risk=[InjuryRiskArea(a) for a in (row.injury_risk or [])],
        created_at=row.created_at,
    )


class AssessmentRepository:
    """评估的持久化访问。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, assessment: Assessment) -> Assessment:
        """写入评估；若同 user_id 已存在则覆盖更新。"""
        row = self._session.get(AssessmentORM, str(assessment.user_id))
        if row is None:
            row = AssessmentORM(user_id=str(assessment.user_id))
            self._session.add(row)
        row.goal = assessment.goal.value
        row.venue = assessment.venue.value
        row.equipment = list(assessment.equipment)
        row.weekly_frequency = assessment.weekly_frequency
        row.injury_risk = [a.value for a in assessment.injury_risk]
        row.created_at = assessment.created_at
        self._session.commit()
        return _to_model(row)

    def get(self, user_id: UUID) -> Assessment | None:
        row = self._session.get(AssessmentORM, str(user_id))
        return _to_model(row) if row is not None else None
