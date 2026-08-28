"""配置加载单元测试（任务 2.1）。

覆盖：
- Settings 默认 DATABASE_URL 为本地 SQLite。
- 缺失的第三方密钥默认为 None（导入/加载阶段不崩溃）。
"""

from app.core.config import DEFAULT_DATABASE_URL, Settings


def test_settings_default_database_url_is_sqlite() -> None:
    """未显式提供时，DATABASE_URL 默认应为本地 SQLite。"""
    settings = Settings()

    assert settings.DATABASE_URL == DEFAULT_DATABASE_URL
    assert settings.DATABASE_URL.startswith("sqlite:")


def test_settings_optional_secrets_default_to_none() -> None:
    """第三方密钥可选：缺失时默认为 None，不应在构造时抛错。"""
    settings = Settings()

    assert settings.OPENROUTER_API_KEY is None
    assert settings.ELEVENLABS_API_KEY is None


def test_settings_accepts_explicit_values() -> None:
    """显式传入的配置值应被保留。"""
    settings = Settings(
        DATABASE_URL="sqlite:///./custom.db",
        OPENROUTER_API_KEY="explicit-value",
    )

    assert settings.DATABASE_URL == "sqlite:///./custom.db"
    assert settings.OPENROUTER_API_KEY == "explicit-value"
