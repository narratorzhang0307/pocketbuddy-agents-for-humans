"""会员权益仓储（任务 3.2，需求 8）。

管理用户的 ``entitlement``（free/pro）与 ``free_quota_used`` 计数。
业务规则（额度上限、付费墙判定、凭证校验）在服务层（任务 5.1/5.4），
仓储仅负责存取与原子的计数自增。
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enums import Entitlement
from app.models.orm import UserEntitlementORM
from app.models.schemas import UserEntitlement


def _to_model(row: UserEntitlementORM) -> UserEntitlement:
    return UserEntitlement(
        user_id=UUID(row.user_id),
        entitlement=Entitlement(row.entitlement),
        free_quota_used=row.free_quota_used,
        updated_at=row.updated_at,
    )


class EntitlementRepository:
    """用户权益的持久化访问。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_create(self, user_id: UUID) -> UserEntitlement:
        """返回用户权益；不存在则以默认 free 创建。"""
        row = self._session.get(UserEntitlementORM, str(user_id))
        if row is None:
            row = UserEntitlementORM(
                user_id=str(user_id),
                entitlement=Entitlement.FREE.value,
                free_quota_used=0,
                updated_at=datetime.utcnow(),
            )
            self._session.add(row)
            self._session.commit()
        return _to_model(row)

    def set_entitlement(
        self, user_id: UUID, entitlement: Entitlement
    ) -> UserEntitlement:
        row = self._session.get(UserEntitlementORM, str(user_id))
        if row is None:
            row = UserEntitlementORM(user_id=str(user_id))
            self._session.add(row)
        row.entitlement = entitlement.value
        row.updated_at = datetime.utcnow()
        self._session.commit()
        return _to_model(row)

    def increment_quota_used(self, user_id: UUID, amount: int = 1) -> UserEntitlement:
        """免费额度使用计数自增。"""
        current = self.get_or_create(user_id)
        row = self._session.get(UserEntitlementORM, str(user_id))
        assert row is not None
        row.free_quota_used = current.free_quota_used + amount
        row.updated_at = datetime.utcnow()
        self._session.commit()
        return _to_model(row)
