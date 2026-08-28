# Qwen3-4B 服务器验证部署

这套部署只提供 Pocket Buddy/Frost 的本机 Qwen 推理基座，不接公网、不改 Nginx、
不改 DNS，也不替换现有 DashScope 或 Android MNN 路由。

## 固定版本

- 模型：`Qwen/Qwen3-4B-GGUF` 的 `Qwen3-4B-Q4_K_M.gguf`
- 模型 SHA-256：`7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`
- 运行时：`ggml-org/llama.cpp` build `b10488`
- 源码提交：`9d77fa17254e1dee4b9e92504c91611a60b1359f`
- 本机 API：`http://127.0.0.1:8040/v1`
- 模型别名：`qwen3-4b-local`

目标服务器是 4 核、7.3 GiB 内存、无 GPU 的 Alibaba Cloud Linux 3。配置因此限制为
单并发、1024 token 上下文、3 个推理线程和 3.2 GB cgroup 内存上限。空闲 120 秒后
`llama-server` 会卸载模型与 KV cache；新请求会自动重新加载。

## 安装

把本目录复制到服务器后，以 root 执行：

```bash
chmod +x install.sh verify.sh
./install.sh
./verify.sh
```

安装器只写入以下位置：

- `/opt/pocketbuddy/qwen3-4b`
- `/etc/systemd/system/pocketbuddy-qwen3-4b.service`

## 验证与运维

```bash
systemctl status pocketbuddy-qwen3-4b.service
curl -fsS http://127.0.0.1:8040/health
curl -fsS http://127.0.0.1:8040/props
journalctl -u pocketbuddy-qwen3-4b.service -n 100 --no-pager
```

从开发机临时验证时使用 SSH 隧道，不要开放 8040 端口：

```bash
ssh -L 8040:127.0.0.1:8040 user@your-server
```

随后客户端可把 OpenAI 兼容地址临时设为 `http://127.0.0.1:8040/v1`。

## 当前边界

- 这是 CPU 验证环境，适合功能和 Skill 路由验证，不代表最终并发与延迟。
- 运动健康的停止规则、数据权限和确定性校验仍应在 Frost Skill 层执行，不能只依赖模型回答。
- 域名 `pocketbuddy.throughtheglass.art` 暂未接入本服务；正式接入前需要单独增加鉴权、限流和 Nginx 路由。
