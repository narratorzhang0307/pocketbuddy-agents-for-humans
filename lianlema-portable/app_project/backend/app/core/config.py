"""应用配置加载。

使用 python-dotenv 加载 `.env` 中的环境变量，并以 Pydantic ``Settings`` 模型
对其建模。设计要点：

- 导入本模块不会因缺少第三方密钥而崩溃；密钥可选，缺失时为 ``None``。
- 真正使用密钥时由 :class:`app.core.secrets.SecretManager` 负责报错（503）。
- ``get_settings()`` 提供带 ``lru_cache`` 的单例访问方式。
"""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel

# 开发环境默认使用本地 SQLite（需求 11.4）。
DEFAULT_DATABASE_URL = "sqlite:///./dev.db"


class Settings(BaseModel):
    """应用运行所需的配置项。

    第三方凭证均为可选：缺失时保持 ``None``，不在加载阶段抛错，
    仅当通过 ``SecretManager`` 实际取用时才会报缺失错误。
    """

    DATABASE_URL: str = DEFAULT_DATABASE_URL
    OPENROUTER_API_KEY: str | None = None
    ELEVENLABS_API_KEY: str | None = None


def _from_environment() -> Settings:
    """从进程环境变量构建 ``Settings``。

    空字符串视为未配置（归一化为 ``None``），避免 ``.env`` 占位空值被误判为有值。
    """

    def _clean(value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    return Settings(
        DATABASE_URL=_clean(os.getenv("DATABASE_URL")) or DEFAULT_DATABASE_URL,
        OPENROUTER_API_KEY=_clean(os.getenv("OPENROUTER_API_KEY")),
        ELEVENLABS_API_KEY=_clean(os.getenv("ELEVENLABS_API_KEY")),
    )


@lru_cache
def get_settings() -> Settings:
    """返回进程级单例 ``Settings``。

    首次调用时加载 ``.env``（不覆盖已存在的环境变量），随后缓存结果。
    测试中可通过 ``get_settings.cache_clear()`` 重置缓存。
    """

    load_dotenv(override=False)
    return _from_environment()
