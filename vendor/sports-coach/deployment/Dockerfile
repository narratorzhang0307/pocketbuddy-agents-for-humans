# =====================================================================
# 运动部署 Dockerfile（响应评审：原 Dockerfile 未打包 Python 与运动规则）
#  - 基础镜像自带完整 Python 运行时
#  - requirements.txt 安装 NumPy / PyYAML（分析服务唯一依赖）
#  - rules_engine/  五项运动规则（类别表+生物力学规则引擎+教学话术）
#  - configs/       五项运动规则阈值（YAML，可调）
#  - server.py      线上分析接口（相机端抽关键点 → POST 本服务评分/纠错）
#  - verify.py      容器内自检：依赖导入 + 规则文件 + 接口端到端
# =====================================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# 1) Python 依赖：NumPy + PyYAML（利用层缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2) 运动规则文件（五项运动的类别表/规则引擎/话术/阈值配置）
COPY rules_engine ./rules_engine
COPY configs ./configs

# 3) 分析服务与自检脚本
COPY server.py verify.py healthcheck.py ./

RUN useradd --create-home --uid 10001 sports
USER sports

EXPOSE 8000

# 健康检查：验证 Python/依赖/规则文件/HTTP 接口全部可用
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
    CMD ["python", "healthcheck.py", "--url", "http://127.0.0.1:8000"]

CMD ["python", "server.py", "--port", "8000"]
