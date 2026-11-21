# 智慧课程（SmartCourse）刷课 Agent 提示词

> **用法**：把分割线以下的全部内容，作为一条消息粘给具备 `browser-skill`（bsk CLI）能力的 Agent。
> 需要替换：`<章节范围>`、`<课程名称>`、以及第 2 步里的 5 个课程参数（从浏览器地址栏复制）。

---

## 任务

你是一名浏览器自动化执行者。使用 `browser-skill`（`bsk` CLI）操作用户**已经登录**的浏览器，完成智慧课程（`smartcourse.hust.edu.cn`）《<课程名称>》的指定章节。

目标章节：**<章节范围>**（例如：Unit 1 全部 + Unit 2 的 2.1–2.10）

每章有三个任务点，**必须全部完成**：

1. **看视频**（必须真实播放，见铁律）
2. **看学习材料**（可用接口一次标记）
3. **做选择题 / 单元测试**（提交即可，对错不计入本任务目标）

### 成功标准

课程目录树里，目标章节全部显示 `span.icon_Completed`（已完成）。
用第 5 步的 `treestat` 脚本验证，不要用肉眼或页面文字判断。

---

## 一、环境自检

```bash
export PATH="$HOME/.local/bin:$PATH"
export BSK_AUTO_START=0

bsk status --json | grep -E '"pid"|"uptime_secs"'
bsk status --json | grep -A3 '"browsers"'
bsk session start --json          # 记下 session_id
```

- `browsers` 为空 → 让用户打开浏览器，等扩展重连；不要反复重启。
- 两次命令 `pid` 不同 / session 丢失 → 在**持久后台任务**里跑 `bsk daemon start --foreground`，另一次调用再验证。
- 登录过期会跳 CAS（`pass.hust.edu.cn`）→ 用 `bsk request-help --session <SESSION> --prompt "请人工完成 CAS 登录"`，**不要猜账号密码**。

> ⚠️ 判断"是否到位"时，**不要**用 `url_contains: smartcourse.hust.edu.cn` 作为完成条件——
> CAS 登录页 URL 的 `service` 参数里含这个字符串，会误判。

---

## 二、铁律（违反会白跑几小时）

1. **视频必须 1x 真实播放。** 平台按真实时间累计 `playingTime`：
   `playingTime` 增长 ≪ 视频时长时，倍速没有意义，seek 会被重置回已看位置。
2. **播放标签页必须前台可见。** 切到后台，视频模块会暂停且心跳停发。
   因此**播放期间不要用 `--tab-id` 操作其它标签页**——那会激活目标 tab，把播放页切到后台。
3. **串行。** 一次只跑一章，不要并行开多个章节页。
4. **不要重复 borrow 标签页。** 超时可能已经借到了，先 `tab list --scope agent` 确认。
5. **同一错误不重试超过 2 次**，停下来报告。
6. **登录失效就请求人工接管**，不要尝试自动登录。

---

## 三、课程参数

从浏览器地址栏复制一次 URL，取 5 个固定参数（整门课通用，只有 `chapterId` 会变）：

```
https://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy
  ?chapterId=<CID>&courseId=<COURSE_ID>&clazzid=<CLAZZID>&cpi=<CPI>
  &enc=<ENC>&mooc2=1&hidetype=0&openc=<OPENC>
```

把它们记成 shell 变量：

```bash
CID=<chapterId>              # 当前章节（从地址栏复制）
COURSE_ID=<COURSE_ID>
CLAZZID=<CLAZZID>
CPI=<CPI>
ENC=<ENC>
OPENC=<OPENC>
SESSION=<SESSION>
TAB=<学习页 tab id>

url() {
  echo "https://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy?chapterId=$1&courseId=$COURSE_ID&clazzid=$CLAZZID&cpi=$CPI&enc=$ENC&mooc2=1&hidetype=0&openc=$OPENC"
}
```

**章节 ID 通常连号。** 拿到一章的 ID 后可用 `+1` 试下一章；
不确定就用第 5 步的 `treestat` 从目录树 `div#cur<chapterId>` 里读真实 ID。

---

## 四、每章流程

### 第 1 步：导航到章节

```bash
bsk navigate "$(url $CID)" --tab-id $TAB --session $SESSION
sleep 8
```

### 第 2 步：材料任务点（一次请求搞定）

```javascript
(function(){
  var cards=null,fs=document.querySelectorAll('iframe');
  for(var i=0;i<fs.length;i++){if((fs[i].src||'').indexOf('knowledge/cards')>=0){cards=fs[i];break;}}
  if(!cards)return 'NO_CARDS';
  var cw=cards.contentWindow,as=cw&&cw.AttachmentSetting;
  if(!as||!as.attachments)return 'NO_AS';
  var def=as.defaults||{},out=[];
  for(var k=0;k<as.attachments.length;k++){
    var a=as.attachments[k];
    if(!a.jtoken)continue;
    var u='/mooc-ans/job/document?jobid='+a.jobid+'&knowledgeid='+(def.knowledgeid||'')+
          '&courseid='+(def.courseid||'')+'&clazzid='+(def.clazzId||'')+'&jtoken='+a.jtoken+
          '&checkMicroTopic=true&microTopicId=&courseEngineInfo=false';
    var x=new XMLHttpRequest();x.open('GET',u,false);
    try{x.send();out.push(a.jobid+':'+x.responseText.substring(0,60));}catch(e){out.push(a.jobid+':ERR');}
  }
  return out.length?out.join(' | '):'NO_JTOKEN';
})()
```

- `添加考核点成功` / `考核点已经完成` → 完成
- `NO_JTOKEN` / `NO_AS` → 本章无材料任务点（单元测试章常见），**正常**，继续下一步

### 第 3 步：视频（1x，必须前台）

启动播放（自动静音绕开自动播放策略）：

```javascript
(function(){
  var mods=[];function rec(w,d){if(d>3)return;try{var fs=w.document.querySelectorAll('iframe');
    for(var i=0;i<fs.length;i++){if((fs[i].src||'').indexOf('modules/video')>=0)mods.push(fs[i]);
      try{if(fs[i].contentWindow)rec(fs[i].contentWindow,d+1);}catch(e){}}}catch(e){}}rec(window,0);
  if(!mods.length)return 'NO_VMOD';
  var vEls=[];function recV(w,d){if(d>3)return;try{var vs=w.document.querySelectorAll('video');
    for(var i=0;i<vs.length;i++)vEls.push(vs[i]);var fs=w.document.querySelectorAll('iframe');
    for(var j=0;j<fs.length;j++){try{if(fs[j].contentWindow)recV(fs[j].contentWindow,d+1);}catch(e){}}}catch(e){}}recV(window,0);
  var v=vEls[0];if(v){try{v.muted=true;v.playbackRate=1;}catch(e){}}
  var d=mods[0].contentDocument;
  var btn=d.querySelector('.vjs-play-control')||d.querySelector('.vjs-big-play-button')||d.querySelector('button[title*="播放"]');
  if(!btn){var bs=d.querySelectorAll('button');for(var i=0;i<bs.length;i++){
    if((bs[i].getAttribute('title')||bs[i].textContent||'').indexOf('播放')>=0){btn=bs[i];break;}}}
  if(!btn)return 'NO_BTN';
  try{btn.click();}catch(e){return 'CLICK_ERR';}
  return JSON.stringify({ct:v?v.currentTime.toFixed(1):null,dur:v&&!isNaN(v.duration)?v.duration.toFixed(1):null,paused:v?v.paused:null});
})()
```

状态轮询（每 15 秒，直到 `ct >= dur - 1`）：

```javascript
(function(){
  var vs=[];function r(w,d){if(d>3)return;try{var a=w.document.querySelectorAll('video');
    for(var i=0;i<a.length;i++)vs.push(a[i]);var f=w.document.querySelectorAll('iframe');
    for(var j=0;j<f.length;j++){try{if(f[j].contentWindow)r(f[j].contentWindow,d+1);}catch(e){}}}catch(e){}}r(window,0);
  if(!vs.length)return 'NO_VIDEO';
  var v=vs[0];
  return JSON.stringify({vis:document.visibilityState,ct:v.currentTime.toFixed(2),
    dur:isNaN(v.duration)?'NaN':v.duration.toFixed(1),paused:v.paused,ended:v.ended,
    rate:v.playbackRate,err:v.error?v.error.code:null});
})()
```

判读：

- `ct` 持续增长 → 正常，继续等
- `paused:true` → 被暂停（弹窗/失焦），重新 `v.play()`
- `vis:"hidden"` → 标签页跑到后台了，**立即停止操作其它 tab**，把该页切回前台
- `NO_VIDEO` / `NO_VMOD` → 本章没有视频（单元测试章），跳到第 4 步

**轮询上限至少 100 次（≈25 分钟）**——实测有 25 分钟的超长视频。超时就用同样的方式继续补播，别重头开始（播放位置会保留）。

### 第 4 步：选择题 / 单元测试

用下面这段脚本（含所有踩过的坑）：

```javascript
(function(){return new Promise(function(resolve){
  var R={};
  function vis(el){return !!(el.offsetParent||el.getClientRects().length);}
  function allDocs(){var docs=[document],cards=null,fs=document.querySelectorAll('iframe');
    for(var i=0;i<fs.length;i++){if((fs[i].src||'').indexOf('knowledge/cards')>=0){cards=fs[i];break;}}
    if(cards&&cards.contentDocument){docs.push(cards.contentDocument);
      var f2=cards.contentDocument.querySelectorAll('iframe');
      for(var j=0;j<f2.length;j++){try{if(f2[j].contentDocument){docs.push(f2[j].contentDocument);
        var f3=f2[j].contentDocument.querySelectorAll('iframe');
        for(var k=0;k<f3.length;k++){try{if(f3[k].contentDocument)docs.push(f3[k].contentDocument);}catch(e){}}}
      }catch(e){}}}
    return docs;}
  function findQuiz(){var ds=allDocs();for(var d=0;d<ds.length;d++){
    try{if(ds[d].querySelector('span.num_option'))return ds[d];}catch(e){}}return null;}
  function clickText(doc,t){var els=doc.querySelectorAll('button,a,div,span,li'),c=[];
    for(var i=0;i<els.length;i++){var x=(els[i].textContent||'').replace(/\s+/g,'').trim();
      if(x===t&&vis(els[i]))c.push(els[i]);}
    if(!c.length)return null;
    for(var j=0;j<c.length;j++){var cn=(c[j].className||'').toLowerCase();
      if(cn.indexOf('submit')>=0){try{c[j].click();return t+'-cls';}catch(e){}}}
    try{c[c.length-1].click();return t;}catch(e){return null;}}
  function popok(){var el=document.querySelector('#popok');
    if(el&&vis(el)){try{el.click();return 'popok';}catch(e){}}return null;}
  function alertOk(){var ds=allDocs();
    for(var d=0;d<ds.length;d++){var ps=ds[d].querySelectorAll('.popDiv,[class*=Alert],[class*=alert]');
      for(var i=0;i<ps.length;i++){if(!vis(ps[i]))continue;
        var bs=ps[i].querySelectorAll('a,button,span,div');
        for(var j=0;j<bs.length;j++){var t=(bs[j].textContent||'').replace(/\s+/g,'').trim();
          if((t==='确定'||t==='确认')&&vis(bs[j])){try{bs[j].click();return 'ok';}catch(e){}}}}}
    return null;}
  var RE=/练习题|单元测试|测验|作业|章节测试|课程测验/,
      btns=document.querySelectorAll('button,a,div,span,li'),cands=[];
  for(var i=btns.length-1;i>=0;i--){var t=(btns[i].textContent||'').replace(/\s+/g,'').trim();
    if(RE.test(t)&&t.length<=8&&vis(btns[i]))cands.push(btns[i]);}
  var ok=null;
  for(var j=0;j<cands.length;j++){if((cands[j].textContent||'').replace(/\s+/g,'').trim()==='练习题'){ok=cands[j];break;}}
  if(!ok&&cands.length)ok=cands[cands.length-1];
  if(ok){try{ok.click();R.clicked=true;}catch(e){R.clickErr=String(e).substring(0,40);}}else{R.clicked=false;}
  var tries=0,iv=setInterval(function(){
    tries++;var d=findQuiz();
    if(d){clearInterval(iv);
      var opts=d.querySelectorAll('span.num_option'),groups={};
      for(var i=0;i<opts.length;i++){var n=opts[i].getAttribute('name')||('g'+i);(groups[n]=groups[n]||[]).push(opts[i]);}
      var cnt=0;for(var k in groups){if(groups[k].length){try{groups[k][0].click();cnt++;}catch(e){}}}
      R.answered=cnt;R.total=Object.keys(groups).length;
      setTimeout(function(){
        R.submitted=clickText(d,'提交');
        var t2=0,iv2=setInterval(function(){
          t2++;var c=popok();
          if(c){clearInterval(iv2);R.confirmed=c;
            var t3=0,iv3=setInterval(function(){
              t3++;var a=alertOk();
              if(a){clearInterval(iv3);R.alertOk=a;setTimeout(function(){resolve(JSON.stringify(R));},600);}
              else if(t3>20){clearInterval(iv3);resolve(JSON.stringify(R));}},300);}
          else if(t2>40){clearInterval(iv2);R.confirmed=null;resolve(JSON.stringify(R));}},300);
      },800);}
    else if(tries>50){clearInterval(iv);R.err='no quiz doc';resolve(JSON.stringify(R));}},300);
})})()
```

成功标志：

```json
{"clicked":true,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
```

单元测试章：

```json
{"clicked":false,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
```

`clicked:false` 是**正常**的——单元测试章没有「练习题」入口，题目 iframe 直接加载。
只要 `answered≈total` 且 `confirmed:popok` 就算成功。

**关键坑**（脚本已处理，但要知道为什么）：

- 选项是 `span.num_option`，**不是** `input[type=radio]`；
- 提交按钮在**测验文档内**（`a.btnSubmit.workBtnIndex`），顶层那个「提交」无效；
- 确认弹窗按钮是 **`#popok`**，文本叫**「提交」**不是「确定」。

### 第 5 步：验证本章

```bash
bsk reload --tab-id $TAB --session $SESSION
sleep 7
bsk evaluate "<treestat.js 的 JS>" --tab-id $TAB --session $SESSION
```

`treestat` 脚本：

```javascript
(function(){var out=[];document.querySelectorAll('div[id^="cur"]').forEach(function(el){
  var num=((el.querySelector('em.posCatalog_sbar')||{}).textContent||'').replace(/\s+/g,'');
  if(!/^\d\.\d{1,2}$/.test(num))return;
  var done=!!el.querySelector('span.icon_Completed');
  out.push(num+(done?'[DONE]':'[PENDING]'));
});return JSON.stringify(out);})()
```

只认 `icon_Completed`。**不要**用"扫全树文本找待完成"的土办法——父元素含后续章节文字，会误报 PENDING。

若本章仍 PENDING：看日志里该章三段——材料是否成功、视频 `done=1`、答题 `confirmed:popok`，缺哪补哪。

### 第 6 步：下一章

`CID+1`（或从目录树取真实 ID），重复第 1~5 步。

---

## 五、异常处理

| 现象 | 处理 |
|---|---|
| `evaluate` 返回 `{}` | 表达式没包成 IIFE，改成 `(function(){...})()` |
| 视频 poll 不涨 | 先看 `paused` / `vis`；被暂停就 `play()`，hidden 就切回前台 |
| 视频超过轮询上限 | 继续补播（位置会保留），不要重头开始 |
| `quizdo` 返回 `confirmed:null` | 确认弹窗选择器不对，用 `#popok` |
| `no quiz doc` | 题目 iframe 未加载完，重跑一次 |
| `no quiz doc` 反复出现 | 手动 `observe` 看练习入口文案，调整 `RE` 正则 |
| 章节一直 PENDING | 按三段排查：材料 / 视频 / 答题 |
| 跳 CAS 登录 | `request-help` 人工登录，之后继续当前章 |
| `browsers: []` | 让用户打开浏览器，等扩展重连 |

---

## 六、汇报格式

```
## 完成情况

| 章节 | 材料 | 视频 | 答题 | 目录树 |
|---|---|---|---|---|
| 1.1 | 完成 | 06:42/06:42 | 12/12 | DONE |
| 1.2 | 无任务点 | 09:15/09:15 | 8/8 | DONE |
| … | | | | |

总计：X 章完成 / Y 章失败
异常与遗留：
- （如无写"无"）
```

中途停止时说明：停在哪一章、哪一步、错误原文、建议的人工操作。
