"""数据库引擎与会话管理（任务 3.1 基础设施，需求 10.4）。

开发环境默认 SQLite（``sqlite:///./dev.db``），生产环境通过 ``DATABASE_URL``
切换到 PostgreSQL。两者共享同一套 ORM 定义与仓储接口（任务 3.2）。

本模块只提供引擎/会话工厂与声明式 ``Base``，不在导入时建表，建表与迁移由
Alembic（任务 3.2）负责；测试可调用 :func:`create_all` 在 SQLite 上快速建表。
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """全部 ORM 表的声明式基类。"""


def _make_engine(database_url: str | None = None):
    """创建数据库引擎。SQLite 需要 ``check_same_thread=False`` 以配合多线程测试。"""
    url = database_url or get_settings().DATABASE_URL
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI 依赖：提供一个请求级数据库会话并在结束时关闭。"""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def create_all(target_engine=None) -> None:
    """在目标引擎上创建全部表（主要供测试/本地初始化使用）。

    导入 ORM 模块以确保所有表都已注册到 ``Base.metadata``。
    """
    from app.models import orm  # noqa: F401  (触发表注册)

    Base.metadata.create_all(bind=target_engine or engine)
