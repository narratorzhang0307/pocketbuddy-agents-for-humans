"""日志脱敏单元测试（任务 2.2，需求 11.4 / Correctness Property 12 凭证零泄漏）。

覆盖：
- ``mask_secret`` 对典型密钥只暴露前 2 后 2 位；短值整体掩码。
- ``SensitiveDataFilter`` 对结构化 ``dict`` 与 ``KEY=VALUE`` / ``KEY: VALUE`` 文本掩码，
  捕获到的日志输出中不出现任何明文密钥值。
- ``configure_logging`` 幂等安装，且经其配置后明文不进入 handler 输出。

测试中的"密钥"全部为内存中的假值，不写入任何文件。
"""

from __future__ import annotations

import io
import logging

import pytest

from app.core.logging import (
    SensitiveDataFilter,
    configure_logging,
    mask_secret,
    mask_text,
)

# 仅存在于内存中的假凭证值，用于断言其不出现在日志输出中。
_OPENROUTER = "sk-or-1234567890abcdef"
_ELEVENLABS = "el-9876543210zyxwvu"
_AUTHZ_TOKEN = "Bearer abcdefghijklmnopqrstuvwxyz"
_API_KEY = "key-abcdef123456"


# --------------------------- mask_secret -----------------------------------


def test_mask_secret_keeps_only_first_two_and_last_two() -> None:
    """典型密钥仅暴露前 2 与后 2 位，中间被掩码。"""
    masked = mask_secret("sk-1234567890abcd")

    assert masked == "sk***cd"
    assert "1234567890ab" not in masked


@pytest.mark.parametrize("short_value", ["", "a", "ab", "abc", "abcd"])
def test_mask_secret_fully_masks_short_values(short_value: str) -> None:
    """长度 <= 4 的值整体掩码，避免被反推。"""
    assert mask_secret(short_value) == "***"


def test_mask_secret_does_not_leak_full_value() -> None:
    """掩码结果不得包含完整原值。"""
    masked = mask_secret(_OPENROUTER)

    assert _OPENROUTER not in masked
    assert masked.startswith("sk")
    assert masked.endswith(_OPENROUTER[-2:])


# --------------------------- mask_text -------------------------------------


def test_mask_text_handles_key_value_forms() -> None:
    """``KEY=VALUE`` 与 ``KEY: VALUE`` 两种文本形式均被掩码。"""
    text = f"OPENROUTER_API_KEY={_OPENROUTER} api_key: {_API_KEY}"

    masked = mask_text(text)

    assert _OPENROUTER not in masked
    assert _API_KEY not in masked
    # 键名保留，便于排障。
    assert "OPENROUTER_API_KEY=" in masked
    assert "api_key:" in masked


def test_mask_text_masks_authorization_bearer_token() -> None:
    """``Authorization`` 头中的 Bearer 令牌被掩码，方案前缀保留。"""
    masked = mask_text(f"Authorization: {_AUTHZ_TOKEN}")

    assert "abcdefghijklmnopqrstuvwxyz" not in masked
    assert "Bearer" in masked


# --------------------------- SensitiveDataFilter ---------------------------


def _make_logger_with_capture() -> tuple[logging.Logger, io.StringIO]:
    """构造一个挂载脱敏过滤器、输出到内存缓冲的独立 logger。"""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.addFilter(SensitiveDataFilter())

    logger = logging.getLogger("test.logging.capture")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger, stream


def test_filter_masks_structured_dict_args() -> None:
    """结构化 dict（record.args）中的敏感字段被掩码，明文不出现在输出。"""
    logger, stream = _make_logger_with_capture()

    logger.info(
        "calling provider with %(payload)s",
        {
            "payload": {
                "OPENROUTER_API_KEY": _OPENROUTER,
                "ELEVENLABS_API_KEY": _ELEVENLABS,
                "Authorization": _AUTHZ_TOKEN,
                "api_key": _API_KEY,
                "user_id": "u-123",
            }
        },
    )

    output = stream.getvalue()
    assert _OPENROUTER not in output
    assert _ELEVENLABS not in output
    assert _API_KEY not in output
    assert "abcdefghijklmnopqrstuvwxyz" not in output
    # 非敏感字段保持可见。
    assert "u-123" in output


def test_filter_masks_key_value_text() -> None:
    """``KEY=VALUE`` 文本形式（record.msg 模板）中的密钥被掩码。"""
    logger, stream = _make_logger_with_capture()

    logger.info("env loaded OPENROUTER_API_KEY=%s", _OPENROUTER)

    output = stream.getvalue()
    assert _OPENROUTER not in output
    assert "OPENROUTER_API_KEY=" in output


def test_filter_masks_case_insensitive_api_key_suffix() -> None:
    """``*_API_KEY`` 键名匹配大小写不敏感。"""
    logger, stream = _make_logger_with_capture()

    logger.info("debug %(data)s", {"data": {"openrouter_api_key": _OPENROUTER}})

    output = stream.getvalue()
    assert _OPENROUTER not in output


# --------------------------- configure_logging -----------------------------


def test_configure_logging_is_idempotent() -> None:
    """重复调用不会重复添加 handler 或脱敏过滤器。"""
    root = logging.getLogger()
    original_handlers = list(root.handlers)
    try:
        configure_logging()
        handler_count = len(root.handlers)
        configure_logging()

        assert len(root.handlers) == handler_count
        for handler in root.handlers:
            filters = [f for f in handler.filters if isinstance(f, SensitiveDataFilter)]
            assert len(filters) == 1
    finally:
        root.handlers = original_handlers


def test_configured_root_masks_secret_in_output() -> None:
    """经 configure_logging 安装后，root handler 输出不含明文密钥。"""
    root = logging.getLogger()
    original_handlers = list(root.handlers)
    original_level = root.level
    try:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(logging.Formatter("%(message)s"))
        root.handlers = [handler]

        configure_logging()
        logging.getLogger("app.some.module").info(
            "outbound %(d)s", {"d": {"ELEVENLABS_API_KEY": _ELEVENLABS}}
        )

        assert _ELEVENLABS not in stream.getvalue()
    finally:
        root.handlers = original_handlers
        root.setLevel(original_level)
