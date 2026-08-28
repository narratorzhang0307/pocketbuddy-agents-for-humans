"""训练会话仓储（任务 3.2，需求 7.1 / 7.2 / 7.3 / 10）。

负责会话主体与子项（动作组、动作分析、语音命令、报告）的持久化，
并提供按用户时间倒序、分页的训练历史查询（需求 7.3）。
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import (
    ConfidenceLevel,
    FormStatus,
    SupportedExercise,
    VoiceCommand,
)
from app.models.orm import (
    FormAnalysisORM,
    SessionReportORM,
    SetRecordORM,
    TrainingSessionORM,
    VoiceCommandEventORM,
)
from app.models.schemas import (
    FormAnalysis,
    ProblemArea,
    SessionReport,
    SetRecord,
    TrainingSession,
    VoiceCommandEvent,
)


def _form_to_model(row: FormAnalysisORM) -> FormAnalysis:
    return FormAnalysis(
        session_id=UUID(row.session_id),
        exercise=SupportedExercise(row.exercise),
        is_standard=row.is_standard,
        confidence=ConfidenceLevel(row.confidence),
        problem_areas=[ProblemArea.model_validate(p) for p in (row.problem_areas or [])],
        status=FormStatus(row.status),
        correction_text=row.correction_text,
        created_at=row.created_at,
    )


def _to_model(row: TrainingSessionORM) -> TrainingSession:
    report = None
    if row.report is not None:
        report = SessionReport(
            session_id=UUID(row.report.session_id),
            form_score=row.report.form_score,
            risk_notes=list(row.report.risk_notes or []),
            correction_count=row.report.correction_count,
            next_focus=row.report.next_focus,
            summary_text=row.report.summary_text,
        )
    return TrainingSession(
        session_id=UUID(row.session_id),
        user_id=UUID(row.user_id),
        started_at=row.started_at,
        ended_at=row.ended_at,
        sets=[
            SetRecord(
                exercise=SupportedExercise(s.exercise) if s.exercise else None,
                reps=s.reps,
                difficulty=s.difficulty,
            )
            for s in row.sets
        ],
        form_analyses=[_form_to_model(f) for f in row.form_analyses],
        voice_commands=[
            VoiceCommandEvent(
                session_id=UUID(v.session_id),
                command=VoiceCommand(v.command),
                created_at=v.created_at,
            )
            for v in row.voice_commands
        ],
        report=report,
    )


class SessionRepository:
    """训练会话的持久化访问。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, training_session: TrainingSession) -> TrainingSession:
        """创建一个新的训练会话（通常只含起始信息）。"""
        row = TrainingSessionORM(
            session_id=str(training_session.session_id),
            user_id=str(training_session.user_id),
            started_at=training_session.started_at,
            ended_at=training_session.ended_at,
        )
        self._session.add(row)
        self._session.commit()
        return _to_model(row)

    def get(self, session_id: UUID) -> TrainingSession | None:
        row = self._session.get(TrainingSessionORM, str(session_id))
        return _to_model(row) if row is not None else None

    def add_form_analysis(
        self, session_id: UUID, analysis: FormAnalysis
    ) -> FormAnalysis:
        """向会话追加一条动作分析。"""
        row = FormAnalysisORM(
            session_id=str(session_id),
            exercise=analysis.exercise.value,
            is_standard=analysis.is_standard,
            confidence=analysis.confidence.value,
            problem_areas=[p.model_dump(mode="json") for p in analysis.problem_areas],
            status=analysis.status.value,
            correction_text=analysis.correction_text,
            created_at=analysis.created_at,
        )
        self._session.add(row)
        self._session.commit()
        return _form_to_model(row)

    def add_set(self, session_id: UUID, record: SetRecord) -> None:
        """向会话追加一组训练记录。"""
        self._session.add(
            SetRecordORM(
                session_id=str(session_id),
                exercise=record.exercise.value if record.exercise else None,
                reps=record.reps,
                difficulty=record.difficulty,
            )
        )
        self._session.commit()

    def add_voice_command(self, session_id: UUID, event: VoiceCommandEvent) -> None:
        """向会话追加一次语音命令事件。"""
        self._session.add(
            VoiceCommandEventORM(
                session_id=str(session_id),
                command=event.command.value,
                created_at=event.created_at,
            )
        )
        self._session.commit()

    def set_report(self, session_id: UUID, report: SessionReport) -> SessionReport:
        """为会话写入/覆盖训练报告。"""
        existing = self._session.get(SessionReportORM, str(session_id))
        if existing is None:
            existing = SessionReportORM(session_id=str(session_id))
            self._session.add(existing)
        existing.form_score = report.form_score
        existing.risk_notes = list(report.risk_notes)
        existing.correction_count = report.correction_count
        existing.next_focus = report.next_focus
        existing.summary_text = report.summary_text
        self._session.commit()
        return report

    def mark_ended(self, session_id: UUID, ended_at) -> None:
        """标记会话结束时间。"""
        row = self._session.get(TrainingSessionORM, str(session_id))
        if row is not None:
            row.ended_at = ended_at
            self._session.commit()

    def list_by_user(
        self, user_id: UUID, *, limit: int = 20, offset: int = 0
    ) -> list[TrainingSession]:
        """按时间倒序分页返回某用户的训练历史（需求 7.3）。"""
        stmt = (
            select(TrainingSessionORM)
            .where(TrainingSessionORM.user_id == str(user_id))
            .order_by(TrainingSessionORM.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [_to_model(r) for r in self._session.scalars(stmt).all()]
