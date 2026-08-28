"""全局日志配置与敏感数据脱敏（任务 2.2，需求 11.4）。

设计要点（对应 design.md "core/logging.py 日志中间件" 与 Correctness Property 12 凭证零泄漏）：

- :func:`mask_secret` 对敏感值掩码：仅保留前 2 位与后 2 位，中间以固定 ``***`` 代替；
  长度 <= 4 的值整体以 ``***`` 代替，避免短值被反推。
- :class:`SensitiveDataFilter` 为 :class:`logging.Filter`，在日志写出前对记录中的敏感字段掩码。
  覆盖键名：``*_API_KEY``（大小写不敏感）、``Authorization``、``api_key``；
  覆盖形式：结构化 ``dict``（``record.args`` / ``record.msg``）以及文本 ``KEY=VALUE`` / ``KEY: VALUE``。
- :func:`configure_logging` 安装全局 logger 配置（handler + 挂载该 Filter）。
- :class:`RequestLoggingMiddleware` 为可选的 FastAPI/Starlette 中间件，记录请求并对
  ``Authorization`` 头掩码；不改变响应，不影响既有 ``/health``。

本模块只负责日志脱敏，不读取也不持久化任何真实凭证，不改动 secrets/config 行为。
"""

from __future__ import annotations

import logging
import re
from typing import Any, Mapping

# 中间掩码占位符（固定长度，避免泄露原值长度细节）。
_MASK = "***"

# 长度 <= 该阈值的敏感值整体掩码（前后各保留 2 位时无中间可掩，会暴露过多）。
_SHORT_VALUE_THRESHOLD = 4


def mask_secret(value: Any) -> str:
    """对敏感值掩码，仅保留前 2 位与后 2 位。

    Args:
        value: 待掩码的值；非字符串会先转为字符串。

    Returns:
        掩码后的字符串。长度 <= 4 时返回 ``"***"``；否则返回 ``f"{前2}***{后2}"``。

    Examples:
        >>> mask_secret("sk-1234567890abcd")
        'sk***cd'
        >>> mask_secret("abcd")
        '***'
    """
    if not isinstance(value, str):
        value = str(value)
    if len(value) <= _SHORT_VALUE_THRESHOLD:
        return _MASK
    return f"{value[:2]}{_MASK}{value[-2:]}"


def _is_sensitive_key(key: object) -> bool:
    """判断键名是否敏感：``*_API_KEY`` / ``api_key`` / ``Authorization``（大小写不敏感）。"""
    if not isinstance(key, str):
        return False
    normalized = key.strip().lower()
    return (
        normalized == "authorization"
        or normalized == "api_key"
        or normalized.endswith("_api_key")
    )


# 文本形式 ``KEY=VALUE`` / ``KEY: VALUE`` 的脱敏正则。
# - 键名：``*_API_KEY`` / ``API_KEY`` / ``api_key`` / ``authorization``（大小写不敏感）。
# - 键名两侧可带成对引号（dict / JSON repr）。
# - 值前可带 ``Bearer`` / ``Token`` 方案前缀（保留，仅掩码其后的令牌）。
# - 值取到下一个空白、逗号、引号或闭合括号为止。
_TEXT_MASK_RE = re.compile(
    r"(['\"]?)"  # 1: 键名可选开引号
    r"(?P<key>[A-Za-z0-9_]*_API_KEY|API_KEY|api_key|authorization)"
    r"\1"  # 键名闭引号（与开引号一致）
    r"(?P<sep>\s*[:=]\s*)"  # 分隔符（含两侧空白）
    r"(?P<scheme>(?:bearer|token)\s+)?"  # 可选鉴权方案前缀
    r"(?P<value>[^\s,'\"}\)\]]+)",  # 敏感值
    re.IGNORECASE,
)


def _text_repl(match: re.Match[str]) -> str:
    """正则替换回调：保留键名/分隔符/方案前缀，仅掩码值。"""
    quote = match.group(1)
    key = match.group("key")
    sep = match.group("sep")
    scheme = match.group("scheme") or ""
    value = match.group("value")
    return f"{quote}{key}{quote}{sep}{scheme}{mask_secret(value)}"


def mask_text(text: str) -> str:
    """对文本中 ``KEY=VALUE`` / ``KEY: VALUE`` 形式的敏感键值掩码。"""
    return _TEXT_MASK_RE.sub(_text_repl, text)


def mask_mapping(mapping: Mapping[Any, Any]) -> dict[Any, Any]:
    """对字典中的敏感键值掩码，并递归处理嵌套值。"""
    masked: dict[Any, Any] = {}
    for key, value in mapping.items():
        if _is_sensitive_key(key):
            masked[key] = mask_secret(value) if isinstance(value, str) else value
        else:
            masked[key] = _mask_value(value)
    return masked


def _mask_value(value: Any) -> Any:
    """对单个值掩码：``dict`` 递归处理，``str`` 走文本脱敏，其它原样返回。"""
    if isinstance(value, Mapping):
        return mask_mapping(value)
    if isinstance(value, str):
        return mask_text(value)
    return value


class SensitiveDataFilter(logging.Filter):
    """日志过滤器：在记录写出前对敏感字段掩码。

    同时处理：
    - ``record.args``：``dict``（``%(name)s`` 形式）或 ``tuple``（``%s`` 形式）中的敏感项。
    - ``record.msg``：字符串模板中的 ``KEY=VALUE`` / ``KEY: VALUE`` 文本，或直接传入的 ``dict``。

    掩码是幂等的（再次掩码已掩码值不会进一步泄露），可安全用于多个 handler。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # 先对结构化参数做掩码：``dict``（``%(name)s`` 形式）与 ``tuple``（``%s`` 形式）。
        if isinstance(record.args, Mapping):
            record.args = mask_mapping(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(_mask_value(arg) for arg in record.args)

        # 直接以 ``dict`` 作为消息体（``logger.info({...})``）的情形：就地掩码该字典。
        if isinstance(record.msg, Mapping):
            record.msg = mask_mapping(record.msg)
            return True

        # 文本消息：在 ``msg % args`` 渲染为最终字符串后再做文本脱敏。
        #
        # 关键点：绝不能对未渲染的 ``msg`` 模板直接做 ``mask_text``——模板中的
        # ``KEY=%s`` 会把占位符 ``%s`` 当作敏感值掩掉，导致 ``msg`` 与 ``args``
        # 数量不匹配、``msg % args`` 抛 ``TypeError`` 而丢日志。
        # 因此这里先用 ``getMessage()`` 完成格式化，再脱敏，并清空 ``args``。
        if isinstance(record.msg, str):
            rendered = record.getMessage()
            record.msg = mask_text(rendered)
            record.args = None

        return True


def configure_logging(level: int = logging.INFO) -> SensitiveDataFilter:
    """安装全局 logger 配置：root handler + 挂载 :class:`SensitiveDataFilter`。

    幂等：重复调用不会重复添加 handler 或 filter。所有子 logger 的记录都会上抛到
    root handler，从而统一脱敏。

    Args:
        level: root logger 级别，默认 ``INFO``。

    Returns:
        已安装的 :class:`SensitiveDataFilter` 实例。
    """
    root = logging.getLogger()
    root.setLevel(level)

    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s",
            )
        )
        root.addHandler(handler)

    sensitive_filter = SensitiveDataFilter()
    for handler in root.handlers:
        if not any(isinstance(f, SensitiveDataFilter) for f in handler.filters):
            handler.addFilter(sensitive_filter)

    return sensitive_filter


class RequestLoggingMiddleware:
    """可选的 ASGI 中间件：记录请求/响应并对 ``Authorization`` 头掩码。

    实现为最小化 ASGI 中间件，不依赖 ``BaseHTTPMiddleware``，对响应零改动，
    不影响既有 ``/health`` 与异常处理器。
    """

    def __init__(self, app: Any, logger_name: str = "app.request") -> None:
        self._app = app
        self._logger = logging.getLogger(logger_name)

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self._app(scope, receive, send)
            return

        method = scope.get("method", "-")
        path = scope.get("path", "-")
        auth_value: str | None = None
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"authorization":
                auth_value = header_value.decode("latin-1", "replace")
                break

        masked_auth = mask_secret(auth_value) if auth_value else "-"
        self._logger.info("request %s %s authorization=%s", method, path, masked_auth)

        await self._app(scope, receive, send)


def add_request_logging_middleware(app: Any) -> None:
    """将 :class:`RequestLoggingMiddleware` 挂载到 FastAPI/Starlette 应用。"""
    app.add_middleware(RequestLoggingMiddleware)
