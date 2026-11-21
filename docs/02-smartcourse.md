# 智慧课程 SmartCourse 平台自动化

> 域名：`smartcourse.hust.edu.cn`（智慧课程 / 大学英语词汇课等）
> 技术栈：三层 iframe 嵌套 + video.js + 原生 XHR 任务点
> 实测结果：Unit 1 全部 + Unit 2 大部分 + Unit 3 开头，目录树逐章显示「已完成」

---

## 1. 课程结构与 URL

### 1.1 固定参数

每门课在 URL 里带一组固定参数，**从浏览器地址栏复制一次即可整门课通用**：

| 参数 | 说明 |
|---|---|
| `courseId` | 课程 ID |
| `clazzid` | 班级 ID |
| `cpi` | 课程实例 ID |
| `enc` | 加密串 |
| `openc` | 开放课程标记 |
| `chapterId` | 章节 ID（唯一变化项） |

> 模板见 [`tools/smartcourse/config.example.sh`](../../tools/smartcourse/config.example.sh)，运行时参数通过环境变量注入，脚本内不硬编码。

### 1.2 章节 URL 模板

```
https://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy
  ?chapterId=<CID>&courseId=<COURSE_ID>&clazzid=<CLAzzID>&cpi=<CPI>
  &enc=<ENC>&mooc2=1&hidetype=0&openc=<OPENC>
```

> ⚠️ 前缀必须是 `mooc-smartcourse/mycourse`。
> 用相似路径 `mooc-ans/mycourse` 会直接跳 CAS 登录页。

### 1.3 章节 ID 通常是连续的

实测课程共 53 章，chapterId 基本连号，按 Unit 分段：

```
<U1_START>  …  <U1_START+14>     Unit 1（1.1–1.15）
<U2_START>  …  <U2_START+15>     Unit 2（2.1–2.16，末位 = 单元测试）
<U3_START>  …  <U3_START+10>     Unit 3（3.1–3.11，末位 = 单元测试）
<U4_START>  …  <U4_START+10>     Unit 4（4.1–4.11，末位 = 单元测试）
```

拿到第一章 ID 后先试「+1」是否对应下一章，能省去逐个点目录的麻烦。
不确定时用 [`treestat.js`](../tools/smartcourse/treestat.js) 读目录树，
直接从 `div#cur<chapterId>` 取真实 ID 与章节号。

---

## 2. 页面结构（三层 iframe）

```
top 文档 (studentstudy)
└─ iframe#iframe (knowledge/cards)
   └─ iframe (ananas/modules/...)
      ├─ modules/video    → 视频（video.js 扩展）
      ├─ modules/pdf      → 学习材料
      └─ modules/work     → 练习壳
         └─ iframe#frame_content (mooc-ans/api/work) → 真正的题目
```

**跨域注意**：所有 iframe 同域，可以逐层 `contentDocument` 访问。
脚本里统一用递归 `querySelectorAll('iframe')` 收集所有文档，再按特征定位。

---

## 3. 三个任务点

### 3.1 学习材料（最快，一次 XHR）

材料任务点不需要真的"看"——平台记录完成的方式是给对应的 `jobid` 发一次 document 请求：

```javascript
(function(){
  var cards = null, fs = document.querySelectorAll('iframe');
  for (var i = 0; i < fs.length; i++) {
    if ((fs[i].src || '').indexOf('knowledge/cards') >= 0) { cards = fs[i]; break; }
  }
  if (!cards) return 'NO_CARDS';
  var cw = cards.contentWindow, as = cw.AttachmentSetting;
  if (!as || !as.attachments) return 'NO_AS';
  var def = as.defaults || {}, out = [];
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
    try { x.send(); out.push(a.jobid + ':' + x.responseText.substring(0, 60)); }
    catch (e) { out.push(a.jobid + ':ERR' + e); }
  }
  return out.length ? out.join(' | ') : 'NO_JTOKEN';
})()
```

返回 `{"msg":"添加考核点成功","status":true}` 或 `{"msg":"考核点已经完成","status":true}` 均算完成。
`NO_JTOKEN` 表示本章没有材料任务点（单元测试章常见），属正常。

脚本：[`tools/smartcourse/matfin.js`](../../tools/smartcourse/matfin.js)

### 3.2 视频：必须 1x 真实播放

**这是与优学习最大的区别：不能倍速、不能拖拽、不能后台播放。**

平台按心跳累计 `playingTime`：

```
GET /mooc-ans/multimedia/log/a/<cpi>/<enc>?...&playingTime=<秒>&duration=<总长>&jobid=...
```

- 倍速无效：2x 时 `playingTime` 仍按真实时间增长，永远追不上 `duration`；
- seek 会被重置回已看位置；
- **tab 转后台**：模块暂停视频且心跳停发（`visibility` 门控）。

因此：

> **必须串行、必须前台。播放期间不要对其它标签页做 `--tab-id` 操作**，
> 因为 `bsk --tab-id` 会激活目标 tab，导致播放 tab 转入后台而暂停。

**续播红利**：播放位置跨会话保存。如果之前后台播到接近结尾，重新在前台打开并播完最后几秒即可完成。

启动播放（无需 observe 拿 ref，合成点击即可，先静音绕开自动播放策略）：

```javascript
(function(){
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
  if (v) { try { v.muted = true; } catch (e) {} }

  var d = mods[0].contentDocument;
  var btn = d.querySelector('.vjs-play-control') ||
            d.querySelector('.vjs-big-play-button') ||
            d.querySelector('button[title*="播放"]');
  if (!btn) {
    var bs = d.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      if ((bs[i].getAttribute('title') || bs[i].textContent || '').indexOf('播放') >= 0) {
        btn = bs[i]; break;
      }
    }
  }
  if (!btn) return 'NO_BTN';
  try { btn.click(); } catch (e) { return 'CLICK_ERR ' + String(e).substring(0, 40); }

  return JSON.stringify({
    btn: (btn.className || '').substring(0, 40),
    muted: v ? v.muted : null,
    ct: v ? v.currentTime.toFixed(1) : null,
    dur: v && !isNaN(v.duration) ? v.duration.toFixed(1) : null,
    paused: v ? v.paused : null
  });
})()
```

状态轮询（每 15s 一次，直到 `ct >= dur - 1`）：

```javascript
(function(){
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
  var v = vEls[0], b = '';
  try { if (v.buffered.length) b = v.buffered.end(v.buffered.length - 1).toFixed(1); } catch (e) {}
  return JSON.stringify({
    vis: document.visibilityState,
    ct: v.currentTime.toFixed(2),
    dur: isNaN(v.duration) ? 'NaN' : v.duration.toFixed(1),
    rs: v.readyState, ns: v.networkState,
    paused: v.paused, ended: v.ended, muted: v.muted, rate: v.playbackRate,
    buffEnd: b, err: v.error ? v.error.code : null,
    src: (v.currentSrc || '').substring(0, 60)
  });
})()
```

**轮询上限**：实测存在 1520s（25 分钟）的超长视频，`seq 58`（14.5 分钟）会超时失败。
脚本默认 `seq 100`（≈30 分钟）。

### 3.3 选择题 / 单元测试

核心脚本 [`quizdo.js`](../../tools/smartcourse/quizdo.js)，要点：

| 对象 | 选择器 | 说明 |
|---|---|---|
| 题目选项 | `span.num_option` | class=`num_option choice<qid>`，name=`answer<qid>`；**不是** `input[type=radio]` |
| 选中态 | 增加 `check_answer` 类 | 提交前可校验 |
| 提交按钮 | 测验文档内 `a.btnSubmit.workBtnIndex` | 顶层文档另有 `jb_btn` 的"提交"，**点它无效** |
| 确认弹窗 | top 文档 `.popDiv` + `#popok` | 按钮文本是**"提交"**不是"确定"（aria-label=确定） |
| 入口按钮 | 顶层"练习题" | 单元测试章**没有**入口按钮，题目 iframe 直接加载 |

流程：

1. 点入口「练习题」（找不到也继续——单元测试章直载题目）；
2. 轮询直到出现题目文档（`span.num_option`）；
3. 按 `name` 分组，每组点第一个选项；
4. 800ms 后点「提交」；
5. 轮询点 `#popok` 确认；
6. 再点「确定」关掉成功提示。

成功标志：

```json
{"clicked":true,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
```

单元测试章成功标志是 `clicked:false` + `answered/submitted/confirmed` 均有值。

---

## 4. 流水线

### 4.1 单章

```bash
bash run_chapter.sh <chapterId> <tabId>
```

内部顺序：`navigate → sleep 8 → matfin → vidmodplay（最多重试 3 次）→ 轮询 → quizdo`。
单元测试章没有视频，`vidmodplay` 返回 `NO_VMOD`，自动跳过直接答题。

### 4.2 批处理

```bash
bash batch_run.sh <tabId> <CID1> <CID2> ...
```

每章完成后 `reload` + `treestat.js` 验证，日志写 `batch.log`。
建议 `run_in_background: true` 启动，每约 2 分钟 `tail` 一次看 `VERIFY` 行。

### 4.3 可信的完成验证

```javascript
(function(){
  var out = [];
  document.querySelectorAll('div[id^="cur"]').forEach(function (el) {
    var num = ((el.querySelector('em.posCatalog_sbar') || {}).textContent || '').replace(/\s+/g, '');
    if (!/^\d\.\d{1,2}$/.test(num)) return;
    var done = !!el.querySelector('span.icon_Completed');
    var sp = el.querySelector('span.posCatalog_name');
    var title = sp ? (sp.getAttribute('title') || sp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    out.push(num + '[' + (done ? 'DONE' : 'PENDING') + ']' + el.id.replace('cur', '') + ' ' + title);
  });
  return JSON.stringify(out);
})()
```

> ❌ 不要用"扫全树 textContent 找'待完成'"的土办法：
> 父元素包含后续章节文字，会把已完成的章误判为 PENDING。
> ✅ 可靠判据：`div#cur<chapterId>` 内是否存在 `span.icon_Completed`。

---

## 5. 故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `evaluate` 返回 `{}` | 表达式不是 IIFE | 包成 `(function(){...})()` |
| 视频 poll 卡住不涨 | tab 被切后台 / 缓冲 stall | 只操作当前播放 tab，重跑该章（可续播） |
| poll 到上限没播完 | 视频超长（实测 1520s） | 上限已设 100；仍超时用 `finish_video.sh` 补播 |
| `quizdo` 返回 `confirmed:null` | 旧脚本找"确定" | 用本仓库版本（点 `#popok`） |
| `quizdo` 返回 `no quiz doc` | 题目 iframe 未加载完 | 重跑（脚本内置等待与重试） |
| `clicked:false` 但 answered 有值 | 单元测试章无入口按钮 | **正常**，只要后续字段齐全即成功 |
| 章节 PENDING | 三个任务点有缺失 | 查 `batch.log` 该章：MATFIN / poll done=1 / QUIZ confirmed |
| 导航后跳 CAS 登录 | 登录态失效 | `bsk request-help` 人工登录 |
| `browsers: []` | 浏览器被关闭 | 后台启动浏览器保活，等扩展重连 |

### 登录态的两个坑

1. CAS（`pass.hust.edu.cn`）会话会过期，过期即跳登录页。
2. **不要**用 `url_contains: smartcourse.hust.edu.cn` 作为完成条件——
   登录页 URL 的 `service` 参数里含这个字符串，会误判为"已到达"。
   建议不带完成条件，用 `bsk request-help` 让用户人工确认。
