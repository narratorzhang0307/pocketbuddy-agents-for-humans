"""授权与同意仓储（任务 3.2，需求 9.4 / 9.5）。

记录设备权限（camera/microphone/healthkit）与敏感信息同意（sensitive_health）
的授予状态与时间。撤回即把 granted 置为 False（需求 9.5）。
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ConsentType, PermissionScope
from app.models.orm import ConsentRecordORM, PermissionRecordORM
from app.models.schemas import ConsentRecord, PermissionRecord


class ConsentRepository:
    """设备授权与敏感信息同意的持久化访问。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ---- 设备权限 ----
    def set_permission(
        self, user_id: UUID, scope: PermissionScope, granted: bool
    ) -> PermissionRecord:
        row = self._session.get(
            PermissionRecordORM, {"user_id": str(user_id), "scope": scope.value}
        )
        if row is None:
            row = PermissionRecordORM(user_id=str(user_id), scope=scope.value)
            self._session.add(row)
        row.granted = granted
        row.updated_at = datetime.utcnow()
        self._session.commit()
        return PermissionRecord(
            user_id=user_id, scope=scope, granted=granted, updated_at=row.updated_at
        )

    def list_permissions(self, user_id: UUID) -> list[PermissionRecord]:
        stmt = select(PermissionRecordORM).where(
            PermissionRecordORM.user_id == str(user_id)
        )
        return [
            PermissionRecord(
                user_id=UUID(r.user_id),
                scope=PermissionScope(r.scope),
                granted=r.granted,
                updated_at=r.updated_at,
            )
            for r in self._session.scalars(stmt).all()
        ]

    # ---- 敏感信息同意 ----
    def set_consent(
        self,
        user_id: UUID,
        granted: bool,
        consent_type: ConsentType = ConsentType.SENSITIVE_HEALTH,
    ) -> ConsentRecord:
        row = self._session.get(
            ConsentRecordORM,
            {"user_id": str(user_id), "consent_type": consent_type.value},
        )
        if row is None:
            row = ConsentRecordORM(
                user_id=str(user_id), consent_type=consent_type.value
            )
            self._session.add(row)
        row.granted = granted
        row.updated_at = datetime.utcnow()
        self._session.commit()
        return ConsentRecord(
            user_id=user_id,
            consent_type=consent_type,
            granted=granted,
            updated_at=row.updated_at,
        )

    def get_consent(
        self,
        user_id: UUID,
        consent_type: ConsentType = ConsentType.SENSITIVE_HEALTH,
    ) -> ConsentRecord | None:
        row = self._session.get(
            ConsentRecordORM,
            {"user_id": str(user_id), "consent_type": consent_type.value},
        )
        if row is None:
            return None
        return ConsentRecord(
            user_id=UUID(row.user_id),
            consent_type=ConsentType(row.consent_type),
            granted=row.granted,
            updated_at=row.updated_at,
        )

    def has_sensitive_consent(self, user_id: UUID) -> bool:
        """是否已取得敏感信息同意（需求 9.3）。"""
        record = self.get_consent(user_id)
        return bool(record and record.granted)
