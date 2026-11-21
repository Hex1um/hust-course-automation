// 优学习：读取当前页所有元素的学习状态
// 用法： bsk evaluate "$(cat probe_status.js)" --session $SESSION
//
// 输出示例：
//   page=授课视频 | type=4 status=1 viewTime=6580 progress=100.0 t=842
//
// 判读：
//   status=1        → 该任务点已完成，可以翻页
//   viewTime 不涨   → 播放器被暂停或卡住
//   progress<95     → 未达完成线（95% 即完成）
(function () {
  try {
    var vm = window.koLearnCourseViewModel;
    if (!vm) return 'NO_VM';

    var pg = vm.currentPage();
    if (!pg) return 'NO_PAGE';

    var els = pg.pageElements();      // 注意：是函数，不是数组
    var v = document.querySelector('video');
    var out = 'page=' + (pg.name ? pg.name() : '?');

    for (var i = 0; i < els.length; i++) {
      var r = els[i].record();
      out += ' | type=' + els[i].type() +
             ' status=' + r.status() +
             ' viewTime=' + Math.round(r.viewTime()) +
             ' progress=' + r.viewProgress();
    }

    out += ' t=' + (v ? v.currentTime.toFixed(0) : '-');
    out += ' dur=' + (v && isFinite(v.duration) ? v.duration.toFixed(0) : '-');
    out += ' rate=' + (v ? v.playbackRate : '-');
    out += ' paused=' + (v ? v.paused : '-');
    return out;
  } catch (e) {
    return 'ERR:' + e.message;
  }
})()
