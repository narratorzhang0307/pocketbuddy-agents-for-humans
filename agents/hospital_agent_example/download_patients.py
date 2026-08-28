"""批量下载患者数据脚本。

用法：
    python download_patients.py [--count N] [--output FILE]

功能：
1. 获取所有患者 ID（去重）
2. 对每个患者发起问诊（获取主诉）
3. 保存到本地 JSON 文件
4. 支持断点续传
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from hospital_agent_sdk import load_config, runtime_config_from_project_config, build_service_clients

DEFAULT_OUTPUT = "patient_data.json"
BATCH_SIZE = 3  # 每批处理的患者数（避免429）
CONCURRENT_LIMIT = 3  # 并发数


def parse_args():
    parser = argparse.ArgumentParser(description="批量下载患者数据")
    parser.add_argument("--count", type=int, default=None, help="要拉取的患者数量（默认全部10000）")
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT, help="输出文件路径")
    parser.add_argument("--resume", action="store_true", help="断点续传（基于已有的输出文件）")
    parser.add_argument("--only-ids", action="store_true", help="只下载患者ID列表，不对话")
    parser.add_argument("--questions", type=int, default=1, help="每个患者问几个问题（默认1个，获取主诉）")
    return parser.parse_args()


def load_existing(output_path: str) -> Dict[str, Any]:
    """加载已有的下载结果"""
    path = Path(output_path)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"警告: {output_path} 格式不正确，重新开始")
    return {"patients": {}, "metadata": {}}


def save_data(output_path: str, data: Dict[str, Any]) -> None:
    """保存数据到文件"""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已保存 {len(data.get('patients', {}))} 个患者数据到 {output_path}")


async def fetch_patient_info(
    clients: Any,
    patient_id: str,
    questions: int = 1,
    max_retries: int = 3,
    retry_delay: float = 5.0,
) -> Dict[str, Any]:
    """获取单个患者的基本信息（含重试和速率控制）"""
    result = {
        "patient_id": patient_id,
        "chief_complaint": "",
        "chat_history": [],
        "collected_at": "",
    }
    
    async def invoke_with_retry(input_data: Dict[str, Any]) -> str:
        """带重试的对话调用，处理 429 速率限制"""
        import time
        for attempt in range(max_retries):
            try:
                return await clients.patient_client.invoke(
                    patient_id=patient_id,
                    input_data=input_data,
                )
            except Exception as e:
                if "429" in str(e) or "limit" in str(e).lower() or "Request limit" in str(e):
                    wait = retry_delay * (attempt + 1)
                    print(f"  速率限制，等待 {wait}s 后重试 (尝试 {attempt+1}/{max_retries})...")
                    await asyncio.sleep(wait)
                else:
                    raise e
        raise Exception(f"请求多次失败: {e}")
    
    try:
        # 第一个问题 - 获取主诉
        answer = await invoke_with_retry({
            "question": "请详细描述这次最主要的不适：包括什么时候开始的、具体有什么症状、有多严重、以及是否伴随其他不适？",
            "chat_history": [],
        })
        result["chief_complaint"] = answer
        result["chat_history"] = [
            {"from": "doctor", "text": "请详细描述这次最主要的不适：包括什么时候开始的、具体有什么症状、有多严重、以及是否伴随其他不适？"},
            {"from": "patient", "text": answer},
        ]
        
        # 第二个问题 - 问过敏史/病史
        if questions >= 2:
            answer2 = await invoke_with_retry({
                "question": "请问您有没有药物或食物过敏史？目前正在服用什么药物？有没有高血压、糖尿病或其他慢性病史？",
                "chat_history": result["chat_history"],
            })
            result["chat_history"].extend([
                {"from": "doctor", "text": "请问您有没有药物或食物过敏史？目前正在服用什么药物？有没有高血压、糖尿病或其他慢性病史？"},
                {"from": "patient", "text": answer2},
            ])
        
        # 第三个问题 - 问既往史/家族史
        if questions >= 3:
            answer3 = await invoke_with_retry({
                "question": "您以前有没有做过手术、住院或长期服用过什么药物？家族里有没有类似疾病或遗传病史？",
                "chat_history": result["chat_history"],
            })
            result["chat_history"].extend([
                {"from": "doctor", "text": "您以前有没有做过手术、住院或长期服用过什么药物？家族里有没有类似疾病或遗传病史？"},
                {"from": "patient", "text": answer3},
            ])
            
    except Exception as e:
        result["error"] = str(e)
    
    return result


async def main():
    args = parse_args()
    
    # 加载配置
    config = load_config("config.yaml")
    runtime = runtime_config_from_project_config(config, {})
    
    print(f"=== 患者数据批量下载 ===")
    print(f"Service: {runtime.service_base_url}")
    print(f"Team ID: {runtime.team_id}")
    print()
    
    # 初始化客户端
    clients = build_service_clients(
        base_url=runtime.service_base_url,
        token=runtime.service_token,
        modelscope_sdk_token=runtime.modelscope_sdk_token,
        model_api_key=runtime.model_api_key,
        team_id=runtime.team_id,
        mode="train",
    )
    
    # 获取患者 ID 列表
    print("正在获取患者 ID 列表...")
    all_ids = await clients.dataset_client.list_patient_ids(
        patient_count=args.count,
        selection="random",
    )
    
    # 去重（保持顺序）
    seen = set()
    unique_ids = []
    for pid in all_ids:
        if pid not in seen:
            seen.add(pid)
            unique_ids.append(pid)
    
    print(f"从服务获取: {len(all_ids)} 个患者")
    print(f"去重后: {len(unique_ids)} 个唯一患者")
    print()
    
    # 如果只需要 ID 列表
    if args.only_ids:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump({
                "patient_ids": unique_ids,
                "count": len(unique_ids),
                "source": "service",
                "datasetKey": "train",
            }, f, ensure_ascii=False, indent=2)
        print(f"已保存 {len(unique_ids)} 个患者 ID 到 {args.output}")
        return
    
    # 加载已有数据（断点续传）
    existing = load_existing(args.output)
    patients = existing.get("patients", {})
    metadata = existing.get("metadata", {})
    
    # 找出还需要下载的患者
    remaining = [pid for pid in unique_ids if pid not in patients]
    if args.resume:
        print(f"断点续传: 已有 {len(patients)} 个，还需下载 {len(remaining)} 个")
    else:
        print(f"全新下载: 需要下载 {len(remaining)} 个患者")
    
    if not remaining:
        print("所有患者已下载完成！")
        return
    
    # 分批下载
    total = len(remaining)
    completed = 0
    
    for i in range(0, total, BATCH_SIZE):
        batch = remaining[i:i + BATCH_SIZE]
        
        # 并发获取（限制并发数，避免 429）
        import time as time_module
        tasks = [fetch_patient_info(clients, pid, args.questions) for pid in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 批次间延时，避免触发速率限制
        if i + BATCH_SIZE < total:
            await asyncio.sleep(2.0)
        
        for pid, result in zip(batch, results):
            if isinstance(result, Exception):
                patients[pid] = {"patient_id": pid, "error": str(result)}
            elif isinstance(result, dict):
                patients[pid] = result
            else:
                patients[pid] = {"patient_id": pid, "error": "Unknown error"}
        
        completed += len(batch)
        
        # 每批保存一次
        save_data(args.output, {
            "patients": patients,
            "metadata": {
                "total_patients": len(unique_ids),
                "downloaded": len(patients),
                "service_url": runtime.service_base_url,
                "team_id": runtime.team_id,
                "questions_per_patient": args.questions,
                "source": "service",
            }
        })
        
        print(f"进度: {completed}/{total} ({(completed/total*100):.1f}%)")
    
    # 最终统计
    print(f"\n=== 下载完成 ===")
    print(f"总患者: {len(unique_ids)}")
    print(f"成功下载: {len([p for p in patients.values() if not p.get('error')])}")
    print(f"失败: {len([p for p in patients.values() if p.get('error')])}")
    
    # 输出样例
    sample = next(iter(patients.values()), None)
    if sample and not sample.get("error"):
        print(f"\n样例数据 ({sample['patient_id']}):")
        print(f"  主诉: {sample['chief_complaint'][:100]}...")


if __name__ == "__main__":
    asyncio.run(main())
