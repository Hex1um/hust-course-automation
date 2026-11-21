// 智慧课程：选择题 / 单元测试自动作答并提交
// 用法： bsk evaluate "$(cat quizdo.js)" --tab-id $TAB --session $SESSION
//
// 成功标志：
//   {"clicked":true,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
// 单元测试章（无入口按钮）成功标志：
//   {"clicked":false,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
//
// 关键点（都踩过坑）：
//   1. 选项是 span.num_option，不是 input[type=radio]
//   2. 提交按钮在测验文档内（a.btnSubmit.workBtnIndex），顶层那个 jb_btn 无效
//   3. 确认弹窗在 top 文档的 .popDiv，按钮是 #popok，文本叫"提交"不是"确定"
//   4. 单元测试章没有入口按钮，题目 iframe 直接加载 —— 不能因 clicked=false 就退出
(function () {
  return new Promise(function (resolve) {
    var R = {};

    function vis(el) {
      return !!(el.offsetParent || el.getClientRects().length);
    }

    // 收集 top + cards + 更深层 iframe 的文档
    function allDocs() {
      var docs = [document];
      var cards = null;
      var fs = document.querySelectorAll('iframe');
      for (var i = 0; i < fs.length; i++) {
        if ((fs[i].src || '').indexOf('knowledge/cards') >= 0) { cards = fs[i]; break; }
      }
      if (cards && cards.contentDocument) {
        docs.push(cards.contentDocument);
        var fs2 = cards.contentDocument.querySelectorAll('iframe');
        for (var j = 0; j < fs2.length; j++) {
          try {
            if (fs2[j].contentDocument) {
              docs.push(fs2[j].contentDocument);
              var fs3 = fs2[j].contentDocument.querySelectorAll('iframe');
              for (var k = 0; k < fs3.length; k++) {
                try { if (fs3[k].contentDocument) docs.push(fs3[k].contentDocument); } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }
      return docs;
    }

    function findQuizDoc() {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        try { if (docs[d].querySelector('span.num_option')) return docs[d]; } catch (e) {}
      }
      return null;
    }

    function clickTextIn(doc, txts) {
      var els = doc.querySelectorAll('button,a,div,span,li');
      var cands = [];
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').replace(/\s+/g, '').trim();
        for (var j = 0; j < txts.length; j++) {
          if (t === txts[j] && vis(els[i])) cands.push(els[i]);
        }
      }
      if (!cands.length) return null;

      // 优先点 class 里带 submit/btn_ok 的
      for (var c = 0; c < cands.length; c++) {
        var cn = (cands[c].className || '').toLowerCase();
        if (cn.indexOf('submit') >= 0 || cn.indexOf('btn_ok') >= 0) {
          try { cands[c].click(); return txts[0] + '-cls'; } catch (e) {}
        }
      }
      try { cands[cands.length - 1].click(); return txts[0]; } catch (e) { return null; }
    }

    // 确认提交弹窗：#popok（文本"提交"，aria-label 才是"确定"）
    function clickPopok() {
      var el = document.querySelector('#popok');
      if (el && vis(el)) {
        try { el.click(); return 'popok'; } catch (e) {}
      }
      var pops = document.querySelectorAll('.popDiv');
      for (var i = 0; i < pops.length; i++) {
        var p = pops[i];
        if (!vis(p)) continue;
        var pt = (p.querySelector('.popWord') || {}).textContent || '';
        if (pt.replace(/\s+/g, '').indexOf('确认提交') >= 0) {
          var ok = p.querySelector('#popok') || p.querySelector('.popBottom a');
          if (ok) { try { ok.click(); return 'popdiv-ok'; } catch (e) {} }
        }
      }
      return null;
    }

    // 通用「提交成功」提示里的 确定/确认
    function clickAlertOk() {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var pops = docs[d].querySelectorAll('.popDiv,[class*=Alert],[class*=alert]');
        for (var i = 0; i < pops.length; i++) {
          var p = pops[i];
          if (!vis(p)) continue;
          var btns = p.querySelectorAll('a,button,span,div');
          for (var j = 0; j < btns.length; j++) {
            var t = (btns[j].textContent || '').replace(/\s+/g, '').trim();
            if ((t === '确定' || t === '确认') && vis(btns[j])) {
              try { btns[j].click(); return 'alert-ok:' + t; } catch (e) {}
            }
          }
        }
      }
      return null;
    }

    // 顶层入口按钮：普通章是「练习题」，单元测试章文案不同
    var ENTRY_RE = /练习题|单元测试|测验|作业|章节测试|课程测验/;
    var btns = document.querySelectorAll('button,a,div,span,li');
    var cands = [];
    for (var i = btns.length - 1; i >= 0; i--) {
      var t = (btns[i].textContent || '').replace(/\s+/g, '').trim();
      if (ENTRY_RE.test(t) && t.length <= 8 && vis(btns[i])) cands.push(btns[i]);
    }

    var ok = null;
    for (var j = 0; j < cands.length; j++) {
      if ((cands[j].textContent || '').replace(/\s+/g, '').trim() === '练习题') { ok = cands[j]; break; }
    }
    if (!ok && cands.length) ok = cands[cands.length - 1];

    if (ok) {
      try { ok.click(); R.clicked = true; R.entry = (ok.textContent || '').replace(/\s+/g, '').trim(); }
      catch (e) { R.clickErr = String(e).substring(0, 40); }
    } else {
      R.clicked = false; // 单元测试章正常如此，继续等题目文档
    }

    // 轮询等题目文档（最长 ~15s）
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var d = findQuizDoc();

      if (d) {
        clearInterval(iv);

        var opts = d.querySelectorAll('span.num_option');
        var groups = {};
        for (var i = 0; i < opts.length; i++) {
          var n = opts[i].getAttribute('name') || ('g' + i);
          (groups[n] = groups[n] || []).push(opts[i]);
        }

        var cnt = 0;
        for (var k in groups) {
          if (groups[k].length) {
            try { groups[k][0].click(); cnt++; } catch (e) {}
          }
        }
        R.answered = cnt;
        R.total = Object.keys(groups).length;

        setTimeout(function () {
          R.submitted = clickTextIn(d, ['提交']);

          var t2 = 0;
          var iv2 = setInterval(function () {
            t2++;
            var cf = clickPopok();
            if (cf) {
              clearInterval(iv2);
              R.confirmed = cf;

              var t3 = 0;
              var iv3 = setInterval(function () {
                t3++;
                var ao = clickAlertOk();
                if (ao) {
                  clearInterval(iv3);
                  R.alertOk = ao;
                  setTimeout(function () { resolve(JSON.stringify(R)); }, 600);
                } else if (t3 > 20) {
                  clearInterval(iv3);
                  resolve(JSON.stringify(R));
                }
              }, 300);
            } else if (t2 > 40) {
              clearInterval(iv2);
              R.confirmed = null;
              resolve(JSON.stringify(R));
            }
          }, 300);
        }, 800);
      } else if (tries > 50) {
        clearInterval(iv);
        R.err = 'no quiz doc after ' + (tries * 300) + 'ms';
        resolve(JSON.stringify(R));
      }
    }, 300);
  });
})()
