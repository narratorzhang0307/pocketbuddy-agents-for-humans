# Sports deployment package / 运动部署交接

This package was supplied as `运动部署修改/运动部署` on 2026-09-12. Its five rule engines, shared geometry helpers and YAML thresholds now power Pocket Buddy's existing sports API. The original supplied directory was not changed.

## Deploy the complete app to Google Cloud Run

**部署主应用时使用仓库根目录的 `Dockerfile`。** 它保留 Node/Web 主服务，同时安装 Python 虚拟环境、NumPy、PyYAML，并复制整个 `vendor/sports-coach`。不需要额外启动本目录的 Python HTTP 服务。

```text
Browser camera → MediaPipe → COCO-17 frames + timestamps + image dimensions
  → same-origin POST /api/sports-coach/assess
  → Node gateway → Python assess.py → deployment/rules_engine + configs
  → existing English feedback + Frost task callback
```

- 根镜像监听 `PORT`（默认 8080），并设置 `SPORTS_COACH_PYTHON=/opt/sports-venv/bin/python`。
- 沿用 [Google Cloud 部署说明](../../../deploy/all-things-agentic/README.md) 中的 Cloud Build / Cloud Run 操作。地图、主 Agent 与凭据配置沿用该说明。
- Google Cloud Run 的启动探针可设置为 HTTP `/api/sports-coach/health`，端口 8080，超时 10 秒、间隔 10 秒、失败阈值 12。这个接口会实际加载 Python 依赖及五项规则。参见 [Google 官方探针说明](https://docs.cloud.google.com/run/docs/configuring/healthchecks)。
- 部署后须检查下面两个接口；不能只凭页面打开就认为分析服务正常。

```sh
curl --fail --silent --show-error "https://YOUR_CLOUD_RUN_HOST/healthz"
curl --fail --silent --show-error "https://YOUR_CLOUD_RUN_HOST/api/sports-coach/health"
```

在安装了本目录 requirements 的电脑上，可以对已部署主应用提交合成关键点，检查全部 23 个动作的真实 API 回包：

```sh
python3 vendor/sports-coach/deployment/verify_app.py --url https://YOUR_CLOUD_RUN_HOST
```

运动接口应返回 `ready: true`、`protocol: pocket-sports-pose/v1`。然后在同一 HTTPS 地址进入运动陪练，首次授权相机，观察骨骼与分析请求；有效画面应出现英文反馈，停止/退出应关闭相机。低置信度或身体遮挡应保持无评分。

从仓库根目录在装有 Docker 的机器上检查镜像：

```sh
docker build -t pocketbuddy-sports:local .
docker run --rm -p 8080:8080 -e FROST_PET_API_ENABLED=false pocketbuddy-sports:local
# In another terminal:
curl --fail http://127.0.0.1:8080/api/sports-coach/health
```

This main image retains the existing primary-Web build scope. Building the yoga and Lianlema child applications remains covered by [the current-source build guide](../../../docs/development/CURRENT-SOURCE-BUILD.md).

## Standalone analysis service

本目录自己的 Dockerfile 只运行 Python 规则 API，不包含 Pocket Buddy 界面。它供独立调试或未来单独部署使用，接口格式与主应用不同。

```sh
# From this directory:
python3 -m pip install -r requirements.txt
python3 server.py --host 127.0.0.1 --port 8000
# In another terminal:
python3 healthcheck.py --url http://127.0.0.1:8000
python3 verify.py --http --url http://127.0.0.1:8000

# Optional standalone container, from this directory:
docker build -t sports-analysis .
docker run --rm -p 8000:8000 sports-analysis
```

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/health` | Python/NumPy/PyYAML versions and loaded rules; failure returns 503 |
| GET | `/sports` | Five sports, source action labels and error codes |
| POST | `/analyze/{sport}` | `{keypoints: [T][17][3], cls_id: integer, fps: number}` |
| POST | `/camera/analyze/{sport}` | Same analysis; no video is accepted |

`sport` is `badminton`, `basketball`, `football`, `volleyball` or `jumprope`. Send 30–90 frames, finite coordinates and confidence, and an explicit action (`cls_id` or exact source `cls_name`). Requests are bounded to 256 KiB. This raw API retains the supplied Chinese source labels and coaching text. Pocket Buddy's adapter adds English presentation, full-body visibility gates, aspect-ratio correction and timestamp resampling; the main UI continues using `/api/sports-coach/*`.

The standalone container health check now probes the actual service on port 8000. It does not start another server and cannot report healthy when the main process is unavailable.

## Verification and provenance

```sh
python3 verify.py                   # 22 dependency, rule and synthetic HTTP checks
python3 test_deployment.py          # invalid inputs, source hashes and live health probes
python3 ../test_adapter.py          # all 23 action IDs, English feedback and pose gates
```

`verify.py` starts a temporary local test server unless `--url` is supplied. Even with `--url`, it submits **synthetic coordinates**, not real camera footage. Real camera, movement accuracy, image build and Cloud Run deployment need their own acceptance evidence.

`source-manifest.json` records the hashes of the 17 supplied source files and identifies the deployment files adapted during integration. The 12 rule/config files are unchanged. Integration adds runtime packaging, health checks and HTTP input validation; it does not replace the existing UI, camera preference, Skill identities or main Agent orchestration.

The original 22 checks passed locally. This handoff is source integration for later deployment; no Google Cloud service was deployed during this change.

Integration verification: the supplied 22 checks, 4 deployment-boundary tests, 10 adapter tests, 99 focused JavaScript/TypeScript tests, bird checks and the main Web build passed locally. A staged production Node service also passed the 23-action API probe, and correctly returned 503 when the packaged rules were absent. Docker was unavailable on the integration machine; container build and Cloud Run acceptance remain for the deployment operator.
