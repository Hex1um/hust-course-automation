#!/bin/bash
# 优学习（ulearning）单视频观看
#
# 用法：
#   ./watch_one.sh <session_id> [stay|next] [rate]
#
#   stay  在当前页观看（默认）
#   next  先点「下一页」再观看；到练习页时会报 NO_VIDEO
#   rate  倍速，默认 6（实测 4~6 稳定；原生 UI 只到 2x，这里走 JS）
#
# 完成判据：Knockout 模型 element.record().status() === 1
#   （平台在 viewProgress >= 95% 时置 1，不等 100%）

set -u

SESSION="${1:-}"
MODE="${2:-stay}"
RATE="${3:-6}"

if [ -z "$SESSION" ]; then
  echo "用法: $0 <session_id> [stay|next] [rate]" >&2
  exit 1
fi

# --- 环境 ---------------------------------------------------------------
BSK_BIN="${BSK_BIN:-$HOME/.local/bin}"
export PATH="$BSK_BIN:$PATH"
export BSK_AUTO_START=0

# --- 1) 需要的话先翻页 ---------------------------------------------------
if [ "$MODE" = "next" ]; then
  REF=$(bsk observe --session "$SESSION" 2>/dev/null \
        | grep -E 'button "下一页"' | head -1 \
        | grep -oE '@e[0-9]+' | head -1)
  if [ -z "$REF" ]; then
    echo "ERROR: 找不到「下一页」按钮（可能已是最后一页）" >&2
    exit 1
  fi
  bsk click "$REF" --session "$SESSION" 2>/dev/null | grep -q "click ok" \
    || { echo "ERROR: 翻页点击失败" >&2; exit 1; }
  sleep 4
fi

# --- 2) 启动播放（倍速 + 播） --------------------------------------------
START=$(bsk evaluate \
  "(function(){var v=document.querySelector('video'); if(!v) return 'NO_VIDEO'; v.playbackRate=$RATE; v.play(); return 'OK';})()" \
  --session "$SESSION" 2>/dev/null | tail -1)

if [ "$START" = "NO_VIDEO" ]; then
  echo "NO_VIDEO: 当前页不是视频页（可能已到练习/图文页）"
  exit 3
fi
echo "$START"
sleep 2

# --- 3) 轮询直到 status === 1 -------------------------------------------
for i in $(seq 1 30); do
  # 自动点掉「走神」弹窗（幂等；按钮不存在时什么也不做）
  bsk evaluate \
    "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf('继续学习')>=0){bs[i].click();break;}}return 1;})()" \
    --session "$SESSION" 2>/dev/null >/dev/null

  ST=$(bsk evaluate \
    "(function(){try{var pg=window.koLearnCourseViewModel.currentPage();var els=pg.pageElements();var o='';for(var i=0;i<els.length;i++){var r=els[i].record();o+=r.status()+'|'+Math.round(r.viewTime())+'|'+r.viewProgress()+';';}var v=document.querySelector('video');return o+' t='+(v?v.currentTime.toFixed(0):'-');}catch(e){return 'ERR:'+e.message;}})()" \
    --session "$SESSION" 2>/dev/null | tail -1)

  echo "[$i] $ST"

  case "$ST" in
    ERR*|"") sleep 8; continue ;;
  esac

  # 输出形如  "0|527|93.3; t=540"   多个元素用 ; 分隔
  if echo "$ST" | grep -qE '(^|;)1\|'; then
    echo "VIDEO_DONE"
    exit 0
  fi

  # 续播：防止弹窗/失焦导致暂停
  bsk evaluate \
    "(function(){var v=document.querySelector('video'); if(v){v.playbackRate=$RATE; if(v.paused){v.play();}} return 1;})()" \
    --session "$SESSION" 2>/dev/null >/dev/null

  sleep 12
done

echo "TIMEOUT: 30 轮仍未完成，检查是否被切到后台或视频卡住" >&2
exit 2
