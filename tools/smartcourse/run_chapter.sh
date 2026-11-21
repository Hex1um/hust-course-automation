#!/bin/bash
# 智慧课程：单章流水线
# 用法： bash run_chapter.sh <chapterId> [tabId]
#   chapterId、参数均从 config.sh 读取课程信息
#
# 流程： navigate → matfin → vidmodplay（重试 3 次）→ 轮询至 ct>=dur-1 → quizdo

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$HERE/config.sh" ]; then
  echo "缺少 $HERE/config.sh，请先 cp config.example.sh config.sh 并填写参数" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$HERE/config.sh"

export PATH="${BSK_BIN:-$HOME/.local/bin}:$PATH"
export BSK_AUTO_START=0

CID="${1:?用法: run_chapter.sh <chapterId> [tabId]}"
TAB="${2:-$SC_TAB_ID}"
SESSION="${SC_SESSION:?config.sh 里没有 SC_SESSION}"
BASE="$(sc_url "$CID")"

cd "$HERE" || exit 1

echo "== NAV $CID =="
bsk navigate "$BASE" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -1
sleep 8

echo "== MATFIN $CID =="
bsk evaluate "$(cat matfin.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -2

echo "== PLAY $CID =="
PLAY=$(bsk evaluate "$(cat vidmodplay.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -2)
for _ in 1 2 3; do
  case "$PLAY" in NO_*) sleep 5; PLAY=$(bsk evaluate "$(cat vidmodplay.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -2);; *) break;; esac
done
echo "$PLAY"

if echo "$PLAY" | grep -q "NO_"; then
  echo "== NO_VIDEO (单元测试章或纯图文章) =="
else
  echo "== POLL $CID =="
  # 上限 100 次 × 15s ≈ 30 分钟，覆盖实测最长的 25 分钟视频
  for i in $(seq 1 100); do
    sleep 15
    ST=$(bsk evaluate "$(cat viddiag.js)" --tab-id "$TAB" --session "$SESSION" 2>/dev/null | head -2)
    CT=$(echo "$ST" | grep -o '"ct":"[0-9.]*"' | cut -d'"' -f4)
    DUR=$(echo "$ST" | grep -o '"dur":"[0-9.]*"' | cut -d'"' -f4)
    DONE=$(awk -v c="$CT" -v d="$DUR" 'BEGIN{ if (d+0>0 && c+0>=d-1) print 1; else print 0 }')
    echo "poll$i ct=$CT dur=$DUR done=$DONE"
    if [ "$DONE" = "1" ]; then break; fi
  done
  sleep 5
fi

echo "== QUIZ $CID =="
bsk evaluate "$(cat quizdo.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -3
echo "== CHAPTER_DONE $CID =="
