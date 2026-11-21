// 智慧课程：材料任务点一次性完成
// 用法： bsk evaluate "$(cat matfin.js)" --tab-id $TAB --session $SESSION
//
// 返回 {"msg":"添加考核点成功","status":true}
//  或 {"msg":"考核点已经完成","status":true}  → 均算完成
// 返回 NO_JTOKEN → 本章无材料任务点（单元测试章常见），正常继续
//
// 原理：cards iframe 的 contentWindow 上有 AttachmentSetting.attachments，
//       每个附件持有 jtoken，带 jtoken 请求 /mooc-ans/job/document 即记完成，
//       不需要真的打开材料、更不需要阅读。
(function () {
  var cards = null;
  var fs = document.querySelectorAll('iframe');
  for (var i = 0; i < fs.length; i++) {
    if ((fs[i].src || '').indexOf('knowledge/cards') >= 0) { cards = fs[i]; break; }
  }
  if (!cards) return 'NO_CARDS';

  var cw = cards.contentWindow;
  var as = cw && cw.AttachmentSetting;
  if (!as || !as.attachments) return 'NO_AS';

  var def = as.defaults || {};
  var out = [];

  for (var k = 0; k < as.attachments.length; k++) {
    var a = as.attachments[k];
    if (!a.jtoken) continue;

    var url = '/mooc-ans/job/document?jobid=' + a.jobid +
              '&knowledgeid=' + (def.knowledgeid || '') +
              '&courseid=' + (def.courseid || '') +
              '&clazzid=' + (def.clazzId || '') +
              '&jtoken=' + a.jtoken +
              '&checkMicroTopic=true&microTopicId=&courseEngineInfo=false';

    var x = new XMLHttpRequest();
    x.open('GET', url, false);
    try {
      x.send();
      out.push(a.jobid + ':' + x.responseText.substring(0, 60));
    } catch (e) {
      out.push(a.jobid + ':ERR' + e);
    }
  }

  return out.length ? out.join(' | ') : 'NO_JTOKEN';
})()
