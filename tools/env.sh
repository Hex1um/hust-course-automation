#!/bin/bash
# 通用环境初始化：source 之后再跑任何 bsk 命令
# 用法： source tools/env.sh
# 可选： SESSION=xxx source tools/env.sh

# bsk CLI 目录（按实际安装位置调整）
BSK_BIN="${BSK_BIN:-$HOME/.local/bin}"
export PATH="$BSK_BIN:$PATH"

# 禁止 CLI 自行拉起临时 daemon（必须已经有一个常驻 daemon）
export BSK_AUTO_START=0

# 可选：隔离的 bsk 运行时目录
# export BSK_HOME="$HOME/.bsk"

# 会话 ID：可通过环境变量传入，或在调用后手动 bsk session start
export SESSION="${SESSION:-}"

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
if ! command -v bsk >/dev/null 2>&1; then
  echo "[env] 找不到 bsk，请设置 BSK_BIN 指向 bsk 所在目录" >&2
  return 1 2>/dev/null || exit 1
fi

if [ -z "$SESSION" ]; then
  echo "[env] 提示：SESSION 未设置。执行："
  echo "        bsk session start --json"
  echo "      然后： export SESSION=<返回的 session_id>"
fi

# 健康检查（daemon 是否常驻）
PID=$(bsk status --json 2>/dev/null | tr -d '\r' | sed -n 's/.*"pid": *\([0-9]*\).*/\1/p' | head -1)
if [ -z "$PID" ]; then
  echo "[env] 没有可用的 daemon。请先在一个持久后台任务里运行：" >&2
  echo "        bsk daemon start --foreground" >&2
else
  echo "[env] daemon pid=$PID  session=${SESSION:-<未设置>}"
fi
