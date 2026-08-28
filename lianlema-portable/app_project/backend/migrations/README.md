# 数据库迁移（Alembic）

本目录管理"练了吗"后端的数据库 Schema 迁移（需求 7.4）。

- 开发环境默认 SQLite（`sqlite:///./dev.db`）。
- 生产环境通过 `DATABASE_URL` 切换到 PostgreSQL，并以 Alembic 管理 Schema 演进。

常用命令（在 `backend/` 下，已激活 .venv）：

```bash
# 应用全部迁移到最新
alembic upgrade head

# 基于 ORM 变更自动生成新迁移
alembic revision --autogenerate -m "描述变更"

# 回退一个版本
alembic downgrade -1
```

迁移环境从 `app.core.config` 读取数据库 URL，目标元数据为 `app.core.database.Base`，
启用 `render_as_batch=True` 以兼容 SQLite 的有限 ALTER 能力。
