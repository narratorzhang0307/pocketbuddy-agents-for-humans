"""仓储集成测试（任务 3.2，需求 1.6/2.8/7.1/7.2/7.3/8/9）。

使用内存 SQLite 建表后，验证各仓储的写入与读取、按用户时间倒序分页、
权益计数自增与撤回同意等行为。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.models import orm  # noqa: F401  (注册表)
from app.models.enums import (
    ConfidenceLevel,
    Entitlement,
    FormStatus,
    PermissionScope,
    SupportedExercise,
    TrainingGoal,
    Venue,
    VoiceCommand,
)
from app.models.schemas import (
    Assessment,
    FormAnalysis,
    PlanDay,
    PlanExercise,
    ProblemArea,
    SessionReport,
    SetRecord,
    TrainingPlan,
    TrainingSession,
    VoiceCommandEvent,
)
from app.repositories import (
    AssessmentRepository,
    ConsentRepository,
    EntitlementRepository,
    PlanRepository,
    SessionRepository,
)


@pytest.fixture()
def session() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    try:
        yield db
    finally:
        db.close()


# --------------------------- Assessment -----------------------------------
def test_assessment_add_and_get(session: Session) -> None:
    repo = AssessmentRepository(session)
    uid = uuid4()
    a = Assessment(
        user_id=uid,
        goal=TrainingGoal.MUSCLE_GAIN,
        venue=Venue.GYM,
        equipment=["dumbbell", "bench"],
        weekly_frequency=4,
        injury_risk=[],
    )
    repo.add(a)

    loaded = repo.get(uid)
    assert loaded is not None
    assert loaded.goal == TrainingGoal.MUSCLE_GAIN
    assert loaded.equipment == ["dumbbell", "bench"]
    assert loaded.weekly_frequency == 4


def test_assessment_add_is_upsert(session: Session) -> None:
    repo = AssessmentRepository(session)
    uid = uuid4()
    repo.add(Assessment(user_id=uid, goal=TrainingGoal.FAT_LOSS, venue=Venue.HOME, weekly_frequency=2))
    repo.add(Assessment(user_id=uid, goal=TrainingGoal.ENDURANCE, venue=Venue.OUTDOOR, weekly_frequency=5))

    loaded = repo.get(uid)
    assert loaded is not None
    assert loaded.goal == TrainingGoal.ENDURANCE
    assert loaded.weekly_frequency == 5


# --------------------------- Plan -----------------------------------------
def _seven_days() -> list[PlanDay]:
    days: list[PlanDay] = []
    for i in range(7):
        if i % 2 == 0:
            days.append(
                PlanDay(
                    day_index=i + 1,
                    is_rest_day=False,
                    exercises=[
                        PlanExercise(
                            name="深蹲",
                            exercise=SupportedExercise.SQUAT,
                            sets=3,
                            reps=10,
                            rest_sec=60,
                            difficulty=2,
                        )
                    ],
                )
            )
        else:
            days.append(PlanDay(day_index=i + 1, is_rest_day=True))
    return days


def test_plan_add_and_get_current_returns_latest(session: Session) -> None:
    repo = PlanRepository(session)
    uid = uuid4()
    old = TrainingPlan(user_id=uid, days=_seven_days(), created_at=datetime(2026, 1, 1))
    new = TrainingPlan(user_id=uid, days=_seven_days(), created_at=datetime(2026, 5, 1))
    repo.add(old)
    repo.add(new)

    current = repo.get_current(uid)
    assert current is not None
    assert current.created_at == datetime(2026, 5, 1)
    assert len(current.days) == 7


# --------------------------- Session --------------------------------------
def test_session_create_append_children_and_report(session: Session) -> None:
    repo = SessionRepository(session)
    uid = uuid4()
    sid = uuid4()
    repo.create(TrainingSession(session_id=sid, user_id=uid))

    repo.add_set(sid, SetRecord(exercise=SupportedExercise.SQUAT, reps=10, difficulty=2))
    repo.add_form_analysis(
        sid,
        FormAnalysis(
            session_id=sid,
            exercise=SupportedExercise.SQUAT,
            is_standard=False,
            confidence=ConfidenceLevel.HIGH,
            problem_areas=[ProblemArea(area="knee_valgus", severity=ConfidenceLevel.HIGH)],
            status=FormStatus.CONCLUSIVE,
            correction_text="膝盖不要内扣",
        ),
    )
    repo.add_voice_command(
        sid, VoiceCommandEvent(session_id=sid, command=VoiceCommand.PAUSE)
    )
    repo.set_report(
        sid,
        SessionReport(
            session_id=sid,
            form_score=80,
            risk_notes=["膝关节注意"],
            correction_count=1,
            next_focus="膝盖外展",
        ),
    )

    loaded = repo.get(sid)
    assert loaded is not None
    assert len(loaded.sets) == 1
    assert len(loaded.form_analyses) == 1
    assert loaded.form_analyses[0].correction_text == "膝盖不要内扣"
    assert len(loaded.voice_commands) == 1
    assert loaded.report is not None
    assert loaded.report.form_score == 80


def test_session_list_by_user_is_desc_and_paginated(session: Session) -> None:
    repo = SessionRepository(session)
    uid = uuid4()
    base = datetime(2026, 5, 1, 12, 0, 0)
    sids = []
    for i in range(3):
        sid = uuid4()
        sids.append(sid)
        repo.create(
            TrainingSession(
                session_id=sid, user_id=uid, started_at=base + timedelta(days=i)
            )
        )

    listed = repo.list_by_user(uid)
    # 时间倒序：最后创建的排第一。
    assert listed[0].session_id == sids[2]
    assert listed[-1].session_id == sids[0]

    page = repo.list_by_user(uid, limit=1, offset=1)
    assert len(page) == 1
    assert page[0].session_id == sids[1]


# --------------------------- Entitlement ----------------------------------
def test_entitlement_get_or_create_defaults_free(session: Session) -> None:
    repo = EntitlementRepository(session)
    uid = uuid4()
    ent = repo.get_or_create(uid)
    assert ent.entitlement == Entitlement.FREE
    assert ent.free_quota_used == 0


def test_entitlement_increment_and_upgrade(session: Session) -> None:
    repo = EntitlementRepository(session)
    uid = uuid4()
    repo.get_or_create(uid)
    repo.increment_quota_used(uid)
    ent = repo.increment_quota_used(uid)
    assert ent.free_quota_used == 2

    upgraded = repo.set_entitlement(uid, Entitlement.PRO)
    assert upgraded.entitlement == Entitlement.PRO


# --------------------------- Consent / Permission -------------------------
def test_permission_set_and_list(session: Session) -> None:
    repo = ConsentRepository(session)
    uid = uuid4()
    repo.set_permission(uid, PermissionScope.CAMERA, True)
    repo.set_permission(uid, PermissionScope.MICROPHONE, False)

    perms = {p.scope: p.granted for p in repo.list_permissions(uid)}
    assert perms[PermissionScope.CAMERA] is True
    assert perms[PermissionScope.MICROPHONE] is False


def test_sensitive_consent_grant_and_withdraw(session: Session) -> None:
    repo = ConsentRepository(session)
    uid = uuid4()
    assert repo.has_sensitive_consent(uid) is False

    repo.set_consent(uid, True)
    assert repo.has_sensitive_consent(uid) is True

    # 撤回同意（需求 9.5）。
    repo.set_consent(uid, False)
    assert repo.has_sensitive_consent(uid) is False
