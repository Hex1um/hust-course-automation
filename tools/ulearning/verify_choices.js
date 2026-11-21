// 优学习：提交练习前校验每题选中了哪一项
// 用法： bsk evaluate "$(cat verify_choices.js)" --session $SESSION
//
// 输出： Q1:C Q2:B Q3:B Q4:D Q5:A
//       每个字母对应该题被选中的选项（A/B/C/D），"-" 表示未选
//
// 原理：选项是 <a class="choice-item">，内层 <div class="checkbox radio">
//       选中后内层 div 会加上 selected 类。
//       每题固定 4 个选项，按顺序每 4 个一组。
(function () {
  var items = document.querySelectorAll('a.choice-item');
  if (!items.length) return 'NO_CHOICE_ITEM';

  var out = [], q = 0, cnt = 0, sel = '';

  for (var i = 0; i < items.length; i++) {
    var box = items[i].querySelector('.checkbox');
    if (box && box.classList.contains('selected')) {
      sel += String.fromCharCode(65 + (i % 4));
    }
    cnt++;
    if (cnt % 4 === 0) {
      out.push('Q' + (++q) + ':' + (sel || '-'));
      sel = '';
    }
  }

  return out.join(' ') + ' (total=' + q + '题)';
})()
