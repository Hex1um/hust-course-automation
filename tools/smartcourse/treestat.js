// 智慧课程：读取目录树完成状态（可信判据）
// 用法： bsk evaluate "$(cat treestat.js)" --tab-id $TAB --session $SESSION
//
// 返回 JSON 数组：
//   ["1.1[DONE]100001 课程介绍", "1.2[PENDING]100002 ..."]
//
// ⚠️ 不要用 textContent 正则扫全树：父元素含后续章节"待完成"文字，会误报 PENDING。
//    可靠判据：div#cur<chapterId> 内是否有 span.icon_Completed。
(function () {
  var out = [];
  document.querySelectorAll('div[id^="cur"]').forEach(function (el) {
    var numEl = el.querySelector('em.posCatalog_sbar') || {};
    var num = (numEl.textContent || '').replace(/\s+/g, '');
    if (!/^\d\.\d{1,2}$/.test(num)) return;

    var done = !!el.querySelector('span.icon_Completed');
    var sp = el.querySelector('span.posCatalog_name');
    var title = sp
      ? (sp.getAttribute('title') || sp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      : '';

    out.push(num + '[' + (done ? 'DONE' : 'PENDING') + ']' + el.id.replace('cur', '') + ' ' + title);
  });
  return JSON.stringify(out);
})()
