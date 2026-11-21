#!/bin/bash
# 智慧课程：多章批处理 + 逐章验证
# 用法： bash batch_run.sh <tabId> <chapterId1> <chapterId2> ...
#
# 建议放后台跑：
#   bash batch_run.sh $TAB 100001 100002 ... &
# 然后每 ~2 分钟 tail 一次 batch.log 看 VERIFY 行

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$HERE/config.sh" ]; then
  echo "缺少 $HERE/config.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$HERE/config.sh"

export PATH="${BSK_BIN:-$HOME/.local/bin}:$PATH"
export BSK_AUTO_START=0

TAB="${1:?用法: batch_run.sh <tabId> <chapterId...>}"
shift
[ $# -gt 0 ] || { echo "没有给 chapterId" >&2; exit 1; }

SESSION="${SC_SESSION:?config.sh 里没有 SC_SESSION}"
LOG="$SC_WORKDIR/batch.log"
cd "$HERE" || exit 1

echo "=== BATCH_START $(date +%H:%M:%S) queue=$* ===" >> "$LOG"

for CID in "$@"; do
  echo "=== $CID START $(date +%H:%M:%S) ===" >> "$LOG"
  bash run_chapter.sh "$CID" "$TAB" >> "$LOG" 2>&1

  # 刷新 + 读目录树状态，确认真完成
  bsk reload --tab-id "$TAB" --session "$SESSION" >> "$LOG" 2>&1
  sleep 7
  ST=$(bsk evaluate "$(cat treestat.js)" --tab-id "$TAB" --session "$SESSION" 2>/dev/null | head -2)

  # 输出该章号对应的状态（依赖章节号与 chapterId 的映射，可自行调整）
  LINE=$(echo "$ST" | grep -o "\[$CID\][^,]*" | head -1)
  echo "=== $CID VERIFY: ${LINE:-未在目录树中找到，请手动核对} ===" >> "$LOG"
done

echo "=== BATCH_COMPLETE $(date +%H:%M:%S) ===" >> "$LOG"
echo "日志： $LOG"
