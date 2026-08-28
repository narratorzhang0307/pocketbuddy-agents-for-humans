"""训练计划仓储（任务 3.2，需求 2.8 / 2.9）。

计划的 ``days`` 结构以 JSON 内嵌存储；查询时返回该用户"最新"的一份计划
（按 created_at 倒序），对应需求 2.9 的"查看当前计划"。
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import TrainingPlanORM
from app.models.schemas import PlanDay, TrainingPlan


def _to_model(row: TrainingPlanORM) -> TrainingPlan:
    return TrainingPlan(
        user_id=UUID(row.user_id),
        days=[PlanDay.model_validate(d) for d in row.days],
        created_at=row.created_at,
    )


class PlanRepository:
    """训练计划的持久化访问。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, plan: TrainingPlan) -> TrainingPlan:
        row = TrainingPlanORM(
            user_id=str(plan.user_id),
            days=[d.model_dump(mode="json") for d in plan.days],
            created_at=plan.created_at,
        )
        self._session.add(row)
        self._session.commit()
        return _to_model(row)

    def get_current(self, user_id: UUID) -> TrainingPlan | None:
        """返回该用户最新的一份计划。"""
        stmt = (
            select(TrainingPlanORM)
            .where(TrainingPlanORM.user_id == str(user_id))
            .order_by(TrainingPlanORM.created_at.desc(), TrainingPlanORM.id.desc())
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return _to_model(row) if row is not None else None
