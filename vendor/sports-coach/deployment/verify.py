#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""运动部署自检脚本：验证 Python依赖 / 规则文件 / 规则引擎 / 线上分析接口。

  python verify.py               # 全部检查（依赖+规则文件+引擎+HTTP接口）
  python verify.py --http --url http://127.0.0.1:8000  # 检查已运行的接口
  python verify.py --quiet       # 简短测试结果；容器探针用 healthcheck.py

"线上相机"验证方式：相机端（浏览器/客户端）逐帧抽取 COCO-17 关键点后按30帧
滑窗 POST 到 /analyze/{sport}；本脚本以合成关键点流完全模拟该链路做端到端断言。
"""
import argparse
import json
import os
import sys
import threading
import urllib.request

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BASE = os.path.dirname(os.path.abspath(__file__))
RESULTS = []


QUIET = False


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    if QUIET and ok:
        return
    print(("  PASS  " if ok else "  FAIL  ") + name + ("  " + detail if not ok else ""))


# ---------------------------------------------------------------- 依赖与规则文件
def check_deps():
    print("[1] Python 依赖与规则文件")
    check("python>=3.9", sys.version_info >= (3, 9), sys.version.split()[0])
    try:
        import numpy as _np
        check("numpy 可导入", True, _np.__version__)
    except Exception as e:
        check("numpy 可导入", False, str(e))
        raise SystemExit(1)
    try:
        import yaml as _y
        check("PyYAML 可导入", True, getattr(_y, "__version__", "ok"))
    except Exception as e:
        check("PyYAML 可导入", False, str(e))
        raise SystemExit(1)

    from rules_engine import SPORTS
    for s in SPORTS:
        m = os.path.join(BASE, "rules_engine", f"{s}.py")
        c = os.path.join(BASE, "configs", f"{s}.yaml")
        check(f"规则文件 {s}", os.path.exists(m) and os.path.exists(c), f"{m} | {c}")


# ---------------------------------------------------------------- 合成关键点（模拟相机端输出）
def _lerp_seq(keys, T=30):
    A = np.stack([np.stack([np.asarray(d[j], np.float32) for j in range(17)]) for d in keys])
    n = A.shape[0]
    idx = np.linspace(0, n - 1, T)
    seq = np.zeros((T, 17, 3), np.float32)
    for j in range(17):
        for c in range(2):
            seq[:, j, c] = np.interp(idx, np.arange(n), A[:, j, c])
    seq[:, :, 2] = 0.95
    return seq


def _base(sh_y=0.35, sh_dx=0.0, hip_y=0.55, knee_y=0.70, ank_y=0.85, knee_x=0.04,
          ank_x=0.06, wr_l=(0.45, 0.50), el_l=(0.46, 0.42),
          wr_r=(0.55, 0.50), el_r=(0.54, 0.42), nose_y=None):
    mx = 0.50 + sh_dx
    return {0: (mx, nose_y if nose_y else sh_y - 0.09),
            1: (mx - 0.013, sh_y - 0.06), 2: (mx + 0.013, sh_y - 0.06),
            3: (mx - 0.02, sh_y - 0.055), 4: (mx + 0.02, sh_y - 0.055),
            5: (mx - 0.03, sh_y), 6: (mx + 0.03, sh_y),
            7: el_l, 8: el_r, 9: wr_l, 10: wr_r,
            11: (0.48, hip_y), 12: (0.52, hip_y),
            13: (0.50 - knee_x, knee_y), 14: (0.50 + knee_x, knee_y),
            15: (0.50 - ank_x, ank_y), 16: (0.50 + ank_x, ank_y)}


def seq_badminton():
    """规范高远球：蓄力→头前上击球→随挥（髋部转体倾斜+7点挥拍路径）"""
    def k(wr, el):
        d = _base(wr_r=wr, el_r=el, wr_l=(0.45, 0.34), el_l=(0.46, 0.42))
        d[11] = (0.48, 0.53)                      # 髋线倾斜≈45°（转体）
        d[12] = (0.52, 0.57)
        return d
    def elbow(w):
        return (0.5 * (0.53 + w[0]) + 0.01, 0.5 * (0.35 + w[1]) - 0.02)
    path = [(0.55, 0.52), (0.58, 0.46), (0.62, 0.38), (0.66, 0.28),
            (0.70, 0.13), (0.73, 0.17), (0.75, 0.19)]
    keys = [k(w, elbow(w)) for w in path]
    return _lerp_seq(keys, 30)


def seq_basketball():
    """规范投篮：深蹲→竖直起跳→过头出手→压腕"""
    def b(sh_y=0.35, hip_y=0.55, knee_y=0.70, ank_y=0.85, knee_x=0.04,
          wr_r=(0.55, 0.45), el_r=(0.539, 0.395), nose_y=None):
        return _base(sh_y, 0.0, hip_y, knee_y, ank_y, knee_x, 0.06,
                     (0.45, 0.42), (0.46, 0.38), wr_r, el_r, nose_y)
    k0 = b()
    k1 = b(0.40, 0.68, 0.78, 0.85, 0.10, (0.52, 0.55), (0.5255, 0.4675), 0.31)
    k2 = b(wr_r=(0.56, 0.34), el_r=(0.5435, 0.3455))
    k2b = b(0.30, 0.50, 0.66, 0.79, 0.06, (0.58, 0.26), (0.5525, 0.282), 0.20)
    k3 = b(0.24, 0.44, 0.60, 0.72, 0.06, (0.65, 0.00), (0.584, 0.132), 0.15)
    k3b = dict(k3); k3b[10] = (0.685, 0.11); k3b[8] = (0.584, 0.132)
    k4 = dict(k3); k4[10] = (0.70, 0.16); k4[8] = (0.584, 0.132)
    return _lerp_seq([k0, k1, k2, k2b, k3, k3b, k4], 30)


def seq_football():
    """规范射门：张臂后摆蓄力(支撑腿屈膝)→前摆触球→随摆"""
    k0 = _base()
    k1 = _base(0.36, 0.0, 0.55, 0.70, 0.85, 0.02, 0.06,
               (0.36, 0.34), (0.42, 0.40), (0.62, 0.44), (0.58, 0.42), 0.27)
    k1[14] = (0.44, 0.64); k1[16] = (0.46, 0.82)          # 摆动腿后摆
    k1[13] = (0.50, 0.76); k1[15] = (0.44, 0.85)          # 支撑腿屈膝站稳
    k2 = _base(0.35, 0.0, 0.55, 0.70, 0.85, 0.04, 0.06,
               (0.40, 0.32), (0.43, 0.38), (0.64, 0.40), (0.60, 0.40), 0.26)
    k2[14] = (0.58, 0.62); k2[16] = (0.60, 0.78)          # 触球
    k2[13] = (0.50, 0.76); k2[15] = (0.44, 0.85)
    k3 = _base(0.35, 0.0, 0.55, 0.70, 0.85, 0.04, 0.06,
               (0.42, 0.32), (0.44, 0.38), (0.66, 0.38), (0.62, 0.38), 0.26)
    k3[14] = (0.60, 0.62); k3[16] = (0.66, 0.72)          # 随摆
    k3[13] = (0.50, 0.76); k3[15] = (0.44, 0.85)
    return _lerp_seq([k0, k1, k2, k3], 30)


def seq_volleyball():
    """规范垫球：低重心前倾+双臂夹直+腹前击球"""
    ready = _base(0.40, 0.03, 0.63, 0.75, 0.85, 0.02, 0.10,
                  (0.56, 0.68), (0.545, 0.60), (0.56, 0.68), (0.545, 0.60), 0.33)
    contact = _base(0.40, 0.03, 0.63, 0.75, 0.85, 0.02, 0.10, nose_y=0.33)
    contact[9] = (0.59, 0.60); contact[10] = (0.59, 0.60)
    contact[7] = (0.53, 0.50); contact[8] = (0.575, 0.50)
    follow = dict(contact)
    follow[9] = (0.60, 0.57); follow[10] = (0.60, 0.57)
    return _lerp_seq([ready, contact, follow], 30)


def seq_jumprope(T=90, hop_times=(10, 25, 40, 55, 70, 85), height=0.03):
    """规范单摇：匀速小跳+手位髋侧（程序化时刻表，可切多窗模拟连续相机流）"""
    seq = np.zeros((T, 17, 3), np.float32)
    arm_dips = list(hop_times)
    for t in range(T):
        off = 0.0
        for t0 in hop_times:
            d = abs(t - t0)
            if d <= 3:
                off = max(off, height * (1 - d / 3.0))
        dip = 0.0
        for t0 in arm_dips:
            d = abs(t - t0)
            if d <= 3:
                dip = max(dip, 0.02 * (1 - d / 3.0))
        sy = 0.36 - 0.7 * off
        coords = {
            15: (0.44, 0.85 - off), 16: (0.56, 0.85 - off),
            13: (0.42, 0.72 - 0.5 * off), 14: (0.58, 0.72 - 0.5 * off),
            11: (0.48, 0.58 - 0.55 * off), 12: (0.52, 0.58 - 0.55 * off),
            5: (0.47, sy), 6: (0.53, sy),
            9: (0.46, 0.66 - dip), 10: (0.54, 0.66 - dip),
            7: (0.455, 0.62 - 0.5 * dip), 8: (0.545, 0.62 - 0.5 * dip),
            0: (0.50, sy - 0.09), 1: (0.487, sy - 0.06), 2: (0.513, sy - 0.06),
            3: (0.48, sy - 0.055), 4: (0.52, sy - 0.055),
        }
        for j, (x, y) in coords.items():
            seq[t, j, 0], seq[t, j, 1], seq[t, j, 2] = x, y, 0.95
    return seq


SYNTH = {
    "badminton": (seq_badminton(), 1),
    "basketball": (seq_basketball(), 3),
    "football": (seq_football(), 3),
    "volleyball": (seq_volleyball(), 1),
    "jumprope": (seq_jumprope(T=30, hop_times=(4, 11, 18, 25)), 1),
}


# ---------------------------------------------------------------- 规则引擎
def check_engines():
    print("[2] 五项运动规则引擎（规范动作 → 零错误高分）")
    from rules_engine import get_engine
    for sport, (seq, cls_id) in SYNTH.items():
        try:
            a = get_engine(sport).assess(seq, cls_id, fps=30)
            codes = [e.code for e in a.errors]
            check(f"{sport} 引擎评估", a.valid and a.errors == [] and a.score >= 90,
                  f"score={a.score} errors={codes} reason={a.invalid_reason}")
        except Exception as e:
            check(f"{sport} 引擎评估", False, repr(e))


# ---------------------------------------------------------------- HTTP 接口（模拟相机流）
def _post(url, payload, timeout=10):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def _get(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def check_http(port=0, verbose=True, url=None):
    print("[3] 线上相机与分析接口（HTTP 端到端，模拟相机关键点流）")
    httpd = None
    if url:
        root = url.rstrip("/")
    else:
        from server import serve
        httpd = serve(port, "127.0.0.1")
        th = threading.Thread(target=httpd.serve_forever, daemon=True)
        th.start()
        root = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        st, health = _get(f"{root}/health")
        check("GET /health", st == 200 and health.get("status") == "ok",
              json.dumps(health, ensure_ascii=False)[:160])
        check("health 报告 Python/NumPy/PyYAML/规则文件",
              all(k in health for k in ("python", "numpy", "pyyaml", "rules_files")),
              str(health.get("rules_files")))
        st, sports = _get(f"{root}/sports")
        check("GET /sports", st == 200 and len(sports) == 5, str(list(sports)))

        for sport, (seq, cls_id) in SYNTH.items():
            payload = {"keypoints": seq.tolist(), "cls_id": cls_id, "fps": 30}
            st, res = _post(f"{root}/analyze/{sport}", payload)
            ok = (st == 200 and res.get("valid") and res.get("score", 0) >= 90
                  and res.get("coach_text"))
            check(f"POST /analyze/{sport}", ok,
                  f"status={st} score={res.get('score')} reason={res.get('invalid_reason')}")

        # 相机连续帧流：90帧合成序列 → 3个30帧滑窗连续提交（跳绳）
        stream = seq_jumprope(T=90, hop_times=(5, 20, 35, 50, 65, 80))
        ok_all = True
        for w in range(3):
            win = stream[w * 30:(w + 1) * 30]
            st, res = _post(f"{root}/camera/analyze/jumprope",
                            {"keypoints": win.tolist(), "cls_id": 1, "fps": 30})
            ok_all = ok_all and st == 200 and res.get("valid") and res.get("n_hops", 0) >= 2
        check("相机连续流 3×30帧 POST /camera/analyze/jumprope", ok_all)
    finally:
        if httpd:
            httpd.shutdown()
            httpd.server_close()


def main():
    ap = argparse.ArgumentParser(description="运动部署自检")
    ap.add_argument("--http", action="store_true", help="仅HTTP接口检查")
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--url", help="检查已运行的服务地址；不启动测试服务器")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    global QUIET
    QUIET = args.quiet

    if not args.quiet:
        print("=" * 60)
        print("运动部署自检（Python/NumPy/PyYAML/规则文件/引擎/接口）")
        print("=" * 60)

    if not args.http:
        check_deps()
        check_engines()
    check_http(args.port, args.quiet, args.url)

    ok = all(o for _, o, _ in RESULTS)
    if args.quiet:
        print("HEALTHY" if ok else "UNHEALTHY")
    else:
        print("=" * 60)
        print(f"结果：{'全部通过' if ok else '存在失败项'}（{sum(o for _, o, _ in RESULTS)}/{len(RESULTS)}）")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
