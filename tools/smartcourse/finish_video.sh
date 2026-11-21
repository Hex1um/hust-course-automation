#!/bin/bash
# 智慧课程：只补播当前页视频到结尾，然后答题
# 用途：视频超过 run_chapter.sh 的轮询上限（超长视频），或上次被中断
# 用法： bash finish_video.sh [tabId]

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

TAB="${1:-$SC_TAB_ID}"
SESSION="${SC_SESSION:?config.sh 里没有 SC_SESSION}"
cd "$HERE" || exit 1

echo "== FINISH_VIDEO tab=$TAB =="

# 续播：播放位置跨会话保存，这里只需继续播完剩余部分
bsk evaluate "$(cat vidmodplay.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -2

for i in $(seq 1 100); do
  sleep 15
  ST=$(bsk evaluate "$(cat viddiag.js)" --tab-id "$TAB" --session "$SESSION" 2>/dev/null | head -2)
  CT=$(echo "$ST" | grep -o '"ct":"[0-9.]*"' | cut -d'"' -f4)
  DUR=$(echo "$ST" | grep -o '"dur":"[0-9.]*"' | cut -d'"' -f4)
  DONE=$(awk -v c="$CT" -v d="$DUR" 'BEGIN{ if (d+0>0 && c+0>=d-1) print 1; else print 0 }')
  echo "poll$i ct=$CT dur=$DUR done=$DONE"
  if [ "$DONE" = "1" ]; then break; fi

  # 被暂停就续播
  bsk evaluate \
    "(function(){var vs=[];function r(w,d){if(d>3)return;try{var a=w.document.querySelectorAll('video');for(var i=0;i<a.length;i++)vs.push(a[i]);var f=w.document.querySelectorAll('iframe');for(var j=0;j<f.length;j++){try{if(f[j].contentWindow)r(f[j].contentWindow,d+1)}catch(e){}}}catch(e){}}r(window,0);if(vs[0]&&vs[0].paused){vs[0].play()}return 1;})()" \
    --tab-id "$TAB" --session "$SESSION" 2>/dev/null >/dev/null
done

sleep 5
echo "== QUIZ =="
bsk evaluate "$(cat quizdo.js)" --tab-id "$TAB" --session "$SESSION" 2>&1 | head -3
echo "== FINISH_DONE =="
