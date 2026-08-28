"""FastAPI 应用入口。

本任务在脚手架基础上注册 ``MissingSecretError`` 的全局异常处理器：
第三方凭证缺失时统一返回 HTTP 503，且响应体不回显任何凭证明文（仅暴露键名）。
具体业务路由由后续任务填充。
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.logging import configure_logging
from app.core.secrets import MissingSecretError

# 应用启动时安装全局日志配置与敏感数据脱敏（任务 2.2，需求 11.4）。
configure_logging()

app = FastAPI(
    title="练了吗 Backend",
    description="AI 健身教练后端服务",
    version="0.1.0",
)


@app.exception_handler(MissingSecretError)
async def missing_secret_handler(
    request: Request, exc: MissingSecretError
) -> JSONResponse:
    """将凭证缺失映射为 503，响应仅含错误标识与缺失键名，不回显密钥值。"""
    return JSONResponse(
        status_code=503,
        content={"detail": "service_unavailable", "missing": exc.secret_name},
    )


@app.get("/health")
def health() -> dict[str, str]:
    """健康检查接口，用于探活。"""
    return {"status": "ok"}
