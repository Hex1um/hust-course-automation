// 智慧课程：视频状态诊断（供轮询）
// 用法： bsk evaluate "$(cat viddiag.js)" --tab-id $TAB --session $SESSION
//
// 返回 JSON：
//   vis      页面可见性（hidden 时视频会被暂停）
//   ct       当前播放位置
//   dur      总时长
//   rs       readyState（4 = 足够数据）
//   paused   是否暂停
//   rate     倍速（应恒为 1）
//   buffEnd  已缓冲到的位置
//   err      媒体错误码（null 为正常）
//
// 完成判定： ct >= dur - 1
(function () {
  var vEls = [];

  function recV(w, d) {
    if (d > 3) return;
    try {
      var vs = w.document.querySelectorAll('video');
      for (var i = 0; i < vs.length; i++) vEls.push(vs[i]);
      var fs = w.document.querySelectorAll('iframe');
      for (var j = 0; j < fs.length; j++) {
        try { if (fs[j].contentWindow) recV(fs[j].contentWindow, d + 1); } catch (e) {}
      }
    } catch (e) {}
  }
  recV(window, 0);

  if (!vEls.length) return 'NO_VIDEO';

  var v = vEls[0];
  var b = '';
  try { if (v.buffered.length) b = v.buffered.end(v.buffered.length - 1).toFixed(1); } catch (e) {}

  return JSON.stringify({
    vis: document.visibilityState,
    hf: (typeof document.hasFocus === 'function' ? document.hasFocus() : null),
    ct: v.currentTime.toFixed(2),
    dur: isNaN(v.duration) ? 'NaN' : v.duration.toFixed(1),
    rs: v.readyState,
    ns: v.networkState,
    paused: v.paused,
    ended: v.ended,
    muted: v.muted,
    rate: v.playbackRate,
    buffEnd: b,
    err: v.error ? v.error.code : null,
    src: (v.currentSrc || '').substring(0, 60)
  });
})()
