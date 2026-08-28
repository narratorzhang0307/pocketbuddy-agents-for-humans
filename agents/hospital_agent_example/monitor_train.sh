#!/bin/bash
# 监控训练进度
cd /mnt/e/yixue/hospital_agent_example

while true; do
    clear
    echo "=========================================="
    echo "  训练进度监控"
    echo "=========================================="
    
    # Check process
    if ps aux | grep train.py | grep -v grep > /dev/null; then
        echo "⏳ 训练运行中..."
    else
        echo "❌ 训练已结束"
        break
    fi
    
    # Latest dir
    LATEST_DIR=$(ls -td outputs/train/train_*/ 2>/dev/null | head -1)
    if [ -n "$LATEST_DIR" ] && [ -f "${LATEST_DIR}final_results.jsonl" ]; then
        COUNT=$(wc -l < "${LATEST_DIR}final_results.jsonl")
        echo "✅ 已完成患者: $COUNT/50 ($(($COUNT * 2))%)"
        
        # Show evaluations
        echo ""
        echo "--- 最近完成的患者评估 ---"
        python3 -c "
import json
with open('${LATEST_DIR}evaluation_results.jsonl') as f:
    lines = [json.loads(l) for l in f]
# Show last 5
for d in lines[-5:]:
    r = d.get('report', {})
    print(f\"  {d.get('patient_id')}: 诊断={r.get('diagnosisAccuracy')}, 检查={r.get('examinationPrecision')}, 治疗={r.get('treatmentOverallScore')}\")
" 2>/dev/null || echo "  (暂无评估数据)"
    else
        echo "⏳ 第一批患者处理中..."
    fi
    
    echo ""
    echo "Memory: $(wc -l < data/memory_data/memory.md) 行"
    echo "刷新时间: $(date '+%H:%M:%S')"
    echo "=========================================="
    
    sleep 60
done
