"""数据模型单元测试（任务 3.1，需求 1.1/1.3/2.2/2.3/7.1/7.2）。

覆盖：
- Pydantic 字段范围校验：weekly_frequency 1~7、difficulty 1~5、form_score 0~100。
- 枚举取值约束。
- SQLAlchemy ORM 表可在内存 SQLite 上建表并完成基本写读。
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models.enums import Entitlement, SupportedExercise, TrainingGoal, Venue
from app.models.schemas import (
    Assessment,
    PlanDay,
    PlanExercise,
    SessionReport,
    SetRecord,
    TrainingPlan,
)


# --------------------------- Pydantic 范围校验 -----------------------------
@pytest.mark.parametrize("freq", [1, 4, 7])
def test_assessment_accepts_valid_weekly_frequency(freq: int) -> None:
    a = Assessment(goal=TrainingGoal.FAT_LOSS, venue=Venue.HOME, weekly_frequency=freq)
    assert a.weekly_frequency == freq


@pytest.mark.parametrize("freq", [0, 8, -1, 100])
def test_assessment_rejects_out_of_range_weekly_frequency(freq: int) -> None:
    with pytest.raises(ValidationError):
        Assessment(goal=TrainingGoal.FAT_LOSS, venue=Venue.HOME, weekly_frequency=freq)


def test_assessment_rejects_invalid_goal() -> None:
    with pytest.raises(ValidationError):
        Assessment(goal="bulk", venue=Venue.HOME, weekly_frequency=3)  # type: ignore[arg-type]


@pytest.mark.parametrize("difficulty", [0, 6, -2])
def test_plan_exercise_rejects_out_of_range_difficulty(difficulty: int) -> None:
    with pytest.raises(ValidationError):
        PlanExercise(
            name="深蹲",
            exercise=SupportedExercise.SQUAT,
            sets=3,
            reps=10,
            rest_sec=60,
            difficulty=difficulty,
        )


def test_plan_exercise_accepts_valid_difficulty() -> None:
    ex = PlanExercise(
        name="深蹲",
        exercise=SupportedExercise.SQUAT,
        sets=3,
        reps=10,
        rest_sec=60,
        difficulty=3,
    )
    assert ex.difficulty == 3


def test_training_plan_requires_exactly_seven_days() -> None:
    days = [PlanDay(day_index=i + 1, is_rest_day=True) for i in range(7)]
    plan = TrainingPlan(user_id=uuid4(), days=days)
    assert len(plan.days) == 7

    with pytest.raises(ValidationError):
        TrainingPlan(user_id=uuid4(), days=days[:5])


@pytest.mark.parametrize("score", [-1, 101, 200])
def test_session_report_rejects_out_of_range_form_score(score: int) -> None:
    with pytest.raises(ValidationError):
        SessionReport(
            session_id=uuid4(),
            form_score=score,
            correction_count=0,
            next_focus="保持核心收紧",
        )


@pytest.mark.parametrize("score", [0, 50, 100])
def test_session_report_accepts_valid_form_score(score: int) -> None:
    report = SessionReport(
        session_id=uuid4(),
        form_score=score,
        correction_count=2,
        next_focus="膝盖不要内扣",
    )
    assert report.form_score == score


def test_set_record_difficulty_bounds() -> None:
    SetRecord(exercise=SupportedExercise.PUSH_UP, reps=12, difficulty=2)
    with pytest.raises(ValidationError):
        SetRecord(exercise=SupportedExercise.PUSH_UP, reps=12, difficulty=9)


# --------------------------- ORM 建表与读写 --------------------------------
def test_orm_tables_create_and_roundtrip() -> None:
    """全部 ORM 表可在内存 SQLite 建表，并完成一次写入/读取。"""
    from app.models import orm

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    uid = str(uuid4())
    sid = str(uuid4())
    with Session(engine) as session:
        session.add(
            orm.AssessmentORM(
                user_id=uid,
                goal="fat_loss",
                venue="home",
                equipment=["none", "dumbbell"],
                weekly_frequency=3,
                injury_risk=["knee"],
                created_at=datetime.utcnow(),
            )
        )
        ts = orm.TrainingSessionORM(session_id=sid, user_id=uid)
        ts.form_analyses.append(
            orm.FormAnalysisORM(
                session_id=sid,
                exercise="squat",
                is_standard=False,
                confidence="high",
                problem_areas=[{"area": "knee_valgus", "severity": "high"}],
                status="conclusive",
                correction_text="膝盖不要内扣",
            )
        )
        ts.report = orm.SessionReportORM(
            session_id=sid,
            form_score=82,
            risk_notes=["膝关节注意"],
            correction_count=1,
            next_focus="膝盖外展",
        )
        session.add(ts)
        session.add(
            orm.UserEntitlementORM(user_id=uid, entitlement=Entitlement.FREE.value)
        )
        session.commit()

    with Session(engine) as session:
        loaded = session.get(orm.TrainingSessionORM, sid)
        assert loaded is not None
        assert len(loaded.form_analyses) == 1
        assert loaded.form_analyses[0].correction_text == "膝盖不要内扣"
        assert loaded.report is not None
        assert loaded.report.form_score == 82
