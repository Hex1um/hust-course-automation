// 智慧课程：启动视频播放
// 用法： bsk evaluate "$(cat vidmodplay.js)" --tab-id $TAB --session $SESSION
//
// 返回 {"btn":"...","muted":true,"ct":"0.0","dur":"842.3","paused":false}
// 返回 NO_VMOD → 本章无视频（单元测试章），跳过播放直接答题
//
// ⚠️ 本平台必须 1x 真实播放：playingTime 只按真实时间累计，
//    设 playbackRate>1 没有意义（进度追不上），且可能被判定异常。
(function () {
  var mods = [];

  function rec(w, d) {
    if (d > 3) return;
    try {
      var fs = w.document.querySelectorAll('iframe');
      for (var i = 0; i < fs.length; i++) {
        if ((fs[i].src || '').indexOf('modules/video') >= 0) mods.push(fs[i]);
        try { if (fs[i].contentWindow) rec(fs[i].contentWindow, d + 1); } catch (e) {}
      }
    } catch (e) {}
  }
  rec(window, 0);
  if (!mods.length) return 'NO_VMOD';

  // 收集所有 document 里的 video
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

  var v = vEls[0];
  if (v) {
    try { v.muted = true; } catch (e) {}   // 静音绕过自动播放策略
    try { v.playbackRate = 1; } catch (e) {} // 明确锁 1x
  }

  var d = mods[0].contentDocument;
  var btn = d.querySelector('.vjs-play-control') ||
            d.querySelector('.vjs-big-play-button') ||
            d.querySelector('button[title*="播放"]');

  if (!btn) {
    var bs = d.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      if ((bs[i].getAttribute('title') || bs[i].textContent || '').indexOf('播放') >= 0) {
        btn = bs[i];
        break;
      }
    }
  }
  if (!btn) return 'NO_BTN';

  try { btn.click(); } catch (e) { return 'CLICK_ERR ' + String(e).substring(0, 40); }
  try { if (v) v.playbackRate = 1; } catch (e) {}

  return JSON.stringify({
    btn: (btn.className || '').substring(0, 40),
    muted: v ? v.muted : null,
    rate: v ? v.playbackRate : null,
    ct: v ? v.currentTime.toFixed(1) : null,
    dur: v && !isNaN(v.duration) ? v.duration.toFixed(1) : null,
    paused: v ? v.paused : null
  });
})()
