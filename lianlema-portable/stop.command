#!/bin/bash
# 练了吗 —— 停止脚本。双击运行。
pkill -f "web_app.py" 2>/dev/null && echo "已停止模型服务" || echo "模型服务未在运行"
pkill -f "expo start" 2>/dev/null && echo "已停止移动端 App" || echo "App 未在运行"
sleep 1
echo "全部已停止。"
read -p "按回车关闭..."
