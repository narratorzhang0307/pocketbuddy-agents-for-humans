# Webcam Retrain Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop webcam recording to the current Flask app, unify video inference behind one server-side helper, and add a bounded retraining entry point using the repository's currently valid local training tensors.

**Architecture:** Keep the existing RTMPose -> ST-GCN -> score -> LLM flow, but move upload inference into a reusable helper that both upload and webcam routes call. Add a small training CLI entry on top of the current data format instead of changing the model architecture. Treat MM-Fit acquisition as a separate follow-up because the current downloaded archive is corrupted and not yet usable.

**Tech Stack:** Python, Flask, PyTorch, NumPy, browser MediaRecorder/getUserMedia, unittest

---

### Task 1: Add regression tests for reusable inference helpers and webcam route validation

**Files:**
- Create: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_web_app_routes.py`
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\web_app.py`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_web_app_routes.py`

- [ ] **Step 1: Write the failing tests**

```python
import io
import unittest
from unittest.mock import patch

import web_app


class WebAppRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = web_app.app.test_client()

    def test_webcam_upload_requires_video_field(self):
        response = self.client.post("/webcam-upload", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        self.assertIn("未选择文件".encode("utf-8"), response.data)

    @patch("web_app.process_video_file")
    def test_webcam_upload_uses_shared_processor(self, mock_process):
        mock_process.return_value = {"action_name": "测试动作", "action_id": 0, "score": 0.9, "heart_rate": 90, "duration": 1.0, "frame_count": 10, "feedback": {"evaluation": "", "analysis": "", "hr_eval": "", "suggestion": "", "encouragement": ""}, "vis_image": ""}
        response = self.client.post(
            "/webcam-upload",
            data={"video": (io.BytesIO(b"fake-video"), "clip.webm")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(mock_process.called)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_web_app_routes -v
```

Expected:
- FAIL because `/webcam-upload` does not exist yet
- or FAIL because `process_video_file` is not defined yet

- [ ] **Step 3: Add the minimal shared helper and webcam route**

```python
def process_video_file(filepath, filename):
    start_time = time.time()
    good_vid, keypoints = RTM_Pose_Tran(filepath, display_pose=False)
    if not good_vid:
        raise ValueError("无法提取骨骼关键点")

    pp_keypoints = PreProcess(keypoints)
    action, conf = model.predict(pp_keypoints)
    action_id = int(action[0][0])
    conf_val = float(conf[0][0])
    score = Score(keypoints, action_id, conf_val)

    if action_id == 14 or (score < 0.3 and conf_val < 0.3):
        action_id = 14
        score = 0.0

    heart_rate = estimate_heart_rate(keypoints)
    duration = time.time() - start_time
    vis_image_path = create_visualization(filepath, keypoints, filename)
    feedback_data = generate_feedback(action_id, score, heart_rate)

    return {
        "filename": filename,
        "action_id": action_id,
        "action_name": ACTION_CLASSES[action_id],
        "score": score,
        "heart_rate": heart_rate,
        "duration": duration,
        "frame_count": keypoints.shape[0],
        "feedback": feedback_data,
        "vis_image": vis_image_path,
    }


@app.route("/webcam-upload", methods=["POST"])
def webcam_upload():
    if "video" not in request.files:
        return render_template("index.html", error="未选择文件")
    file = request.files["video"]
    if file.filename == "":
        return render_template("index.html", error="文件名为空")
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)
    try:
        result_data = process_video_file(filepath, filename)
        return render_template("index.html", result=result_data)
    except Exception as e:
        return render_template("index.html", error=f"处理发生错误: {str(e)}")
    finally:
        try:
            os.remove(filepath)
        except OSError:
            pass
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_web_app_routes -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab add tests\test_web_app_routes.py web_app.py
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab commit -m "feat: add shared video processor and webcam upload route"
```

### Task 2: Add template tests and webcam controls to the UI

**Files:**
- Create: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_template_webcam.py`
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\templates\index.html`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_template_webcam.py`

- [ ] **Step 1: Write the failing template test**

```python
import unittest
from pathlib import Path


class TemplateWebcamTests(unittest.TestCase):
    def test_index_template_contains_webcam_controls(self):
        html = Path("templates/index.html").read_text(encoding="utf-8", errors="ignore")
        self.assertIn("openCameraBtn", html)
        self.assertIn("startRecordingBtn", html)
        self.assertIn("stopRecordingBtn", html)
        self.assertIn("navigator.mediaDevices.getUserMedia", html)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_template_webcam -v
```

Expected:
- FAIL because the current template has no webcam control ids or browser camera API usage

- [ ] **Step 3: Add minimal webcam controls to `templates/index.html`**

```html
<div id="desktopCameraPanel">
  <video id="cameraPreview" autoplay playsinline muted></video>
  <div class="camera-actions">
    <button type="button" id="openCameraBtn">打开摄像头</button>
    <button type="button" id="startRecordingBtn" disabled>开始录制</button>
    <button type="button" id="stopRecordingBtn" disabled>停止并分析</button>
  </div>
  <p id="cameraStatus"></p>
</div>
```

```html
<script>
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

async function openCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  document.getElementById("cameraPreview").srcObject = mediaStream;
  document.getElementById("startRecordingBtn").disabled = false;
}
</script>
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_template_webcam -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab add templates\index.html tests\test_template_webcam.py
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab commit -m "feat: add browser webcam controls to upload page"
```

### Task 3: Add a bounded training CLI for the currently valid local tensors

**Files:**
- Create: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_train_cli.py`
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\src\train.py`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_train_cli.py`

- [ ] **Step 1: Write the failing training CLI tests**

```python
import unittest

from src import train


class TrainCliTests(unittest.TestCase):
    def test_build_train_config_overrides_defaults(self):
        config = train.build_train_config(
            epochs=3,
            batch_size=16,
            data_path="tools/train_keypoints.npy",
            label_path="tools/train_labels.npy",
            output_path="model/test_checkpoint.pth",
            device="cpu",
        )
        self.assertEqual(config["epochs"], 3)
        self.assertEqual(config["batch_size"], 16)
        self.assertEqual(config["device"], "cpu")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_train_cli -v
```

Expected:
- FAIL because `build_train_config` does not exist yet

- [ ] **Step 3: Add minimal config and bounded training entry**

```python
def build_train_config(epochs=5, batch_size=32, data_path="tools/train_keypoints.npy", label_path="tools/train_labels.npy", output_path="model/bootstrap_checkpoint.pth", device=None):
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    return {
        "epochs": epochs,
        "batch_size": batch_size,
        "data_path": data_path,
        "label_path": label_path,
        "output_path": output_path,
        "device": device,
    }
```

```python
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--data-path", default="tools/train_keypoints.npy")
    parser.add_argument("--label-path", default="tools/train_labels.npy")
    parser.add_argument("--output-path", default="model/bootstrap_checkpoint.pth")
    parser.add_argument("--device", default=None)
    args = parser.parse_args()
    config = build_train_config(
        epochs=args.epochs,
        batch_size=args.batch_size,
        data_path=args.data_path,
        label_path=args.label_path,
        output_path=args.output_path,
        device=args.device,
    )
    run_bounded_training(config)
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_train_cli -v
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab add src\train.py tests\test_train_cli.py
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab commit -m "feat: add bounded training cli for local tensor data"
```

### Task 4: Run full verification, a bounded training pass, and start the app

**Files:**
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\web_app.py`
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\templates\index.html`
- Modify: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\src\train.py`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_web_app_routes.py`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_template_webcam.py`
- Test: `C:\Users\10084\Desktop\gemma-webcam-fit3d-lab\tests\test_train_cli.py`

- [ ] **Step 1: Run the focused test suite**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -m unittest tests.test_local_llm tests.test_web_app_routes tests.test_template_webcam tests.test_train_cli -v
```

Expected:
- PASS with 0 failures

- [ ] **Step 2: Run a bounded training pass on the current local tensors**

Run:

```powershell
& C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe src\train.py --epochs 1 --batch-size 16 --device cuda --output-path model\bootstrap_checkpoint.pth
```

Expected:
- training starts successfully
- checkpoint file `model\bootstrap_checkpoint.pth` is created

- [ ] **Step 3: Start the Flask app for manual testing**

Run:

```powershell
Start-Process -FilePath C:\Users\10084\Desktop\gemma\.venv\Scripts\python.exe -ArgumentList 'web_app.py' -WorkingDirectory 'C:\Users\10084\Desktop\gemma-webcam-fit3d-lab' -WindowStyle Hidden
```

Expected:
- local app starts on `http://127.0.0.1:4000`

- [ ] **Step 4: Manual checks**

Check:

```text
1. Open the page in a browser.
2. Confirm upload still works.
3. Confirm the webcam preview opens after browser permission.
4. Record a short clip and confirm the result page renders.
```

- [ ] **Step 5: Commit**

```powershell
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab add web_app.py templates\index.html src\train.py tests\test_web_app_routes.py tests\test_template_webcam.py tests\test_train_cli.py
git -C C:\Users\10084\Desktop\gemma-webcam-fit3d-lab commit -m "feat: add webcam flow and bounded retraining bootstrap"
```
