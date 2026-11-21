# 通用网课平台自动化 Agent 提示词（逆向方法论版）

> **用法**：遇到一个本仓库没覆盖的平台时，把分割线以下内容粘给具备 `browser-skill`（bsk CLI）能力的 Agent。
> 替换：`<平台域名>`、`<课程/章节目标>`。
>
> 这份提示词不假设任何具体选择器——它要求 Agent **先侦察、再动手**，
> 用数据模型而不是页面文字来判断完成。

---

## 任务

你是浏览器自动化执行者。用户已登录 `<平台域名>`，需要你完成 `<课程/章节目标>`。

这个平台不在已知清单里，所以你的第一步不是点按钮，而是**搞清楚三件事**：

1. 页面结构（有没有 iframe / shadow DOM）
2. **完成判据**（哪个字段/接口决定"学完了"）
3. **计时粒度**（按播放位置累计，还是按真实时间累计）

搞清楚之前不要批量操作。搞清楚之后，先跑通一个最小单元，再扩展。

---

## 阶段 0：环境与登录

```bash
export PATH="$HOME/.local/bin:$PATH"
export BSK_AUTO_START=0

bsk status --json | grep -E '"pid"|"uptime_secs"'
bsk status --json | grep -A3 '"browsers"'
bsk session start --json
```

- `browsers: []` → 让用户打开浏览器，等扩展重连。
- 两次命令 `pid` 不同 → daemon 被宿主回收，用持久后台任务跑 `bsk daemon start --foreground`。
- 登录过期 → `bsk request-help --session <SESSION> --prompt "请人工登录"`。**绝不猜账号密码。**

拿标签页：

```bash
bsk tab list --scope user --session <SESSION>
bsk tab borrow <TAB_ID> --session <SESSION>
bsk tab list --scope agent --session <SESSION>   # 确认已移交
```

---

## 阶段 1：页面结构侦察

```bash
bsk observe --session <SESSION> | head -80
bsk get-html --session <SESSION> --out page.html
bsk screenshot --session <SESSION> --out shot.png
```

用 `evaluate` 回答下面几个问题（一次性输出）：

```javascript
(function(){
  var out = {};
  out.title = document.title;
  out.url = location.href.substring(0, 120);
  out.iframes = [];
  document.querySelectorAll('iframe').forEach(function(f){
    out.iframes.push((f.src || '').substring(0, 100));
  });
  out.videos = document.querySelectorAll('video').length;
  out.audios = document.querySelectorAll('audio').length;
  out.hasShadow = !!document.querySelector('*') && (function(){
    var found = false;
    document.querySelectorAll('*').forEach(function(el){
      if (el.shadowRoot) found = true;
    });
    return found;
  })();
  out.buttons = [];
  document.querySelectorAll('button,a[role=button]').forEach(function(b){
    var t = (b.textContent || '').replace(/\s+/g, '').trim();
    if (t && t.length <= 12) out.buttons.push(t);
  });
  out.buttons = out.buttons.slice(0, 40);
  return JSON.stringify(out);
})()
```

判读：

- `videos > 0` → 当前页有视频，很可能按"看完"计；
- `iframes` 非空 → 真正的播放器/题目在 iframe 里，需要递归 `contentDocument`；
- `hasShadow: true` → 选择器要穿 shadow root；
- 页面有"提交/开始/继续"按钮 → 记下文案，后面用来定位。

---

## 阶段 2：找完成判据（核心）

按优先级尝试三种方式，取**最可靠**的那个。

### 2.1 优先：找前端视图模型

现代教学平台基本都在 `window` 上挂了状态对象（Knockout / Vue / React）。

```javascript
(function(){
  var hits = [];
  var keys = Object.keys(window).filter(function(k){
    return /vm|viewmodel|store|app|course|learn|player|chapter/i.test(k) &&
           window[k] && typeof window[k] === 'object';
  });
  keys.slice(0, 20).forEach(function(k){
    var v = window[k];
    var methods = [];
    try {
      for (var p in v) {
        if (typeof v[p] === 'function') methods.push(p);
      }
    } catch (e) {}
    hits.push(k + ' -> ' + methods.slice(0, 15).join(','));
  });
  return hits.join(' || ') || 'NO_VM_FOUND';
})()
```

找到候选对象后，逐层下钻，找形似「status / finished / progress / complete / studyTime / viewTime」的字段：

```javascript
// 把 XXX 换成上一步找到的对象名
(function(){
  try {
    var o = window.XXX;
    var out = [];
    for (var k in o) {
      var t = typeof o[k];
      var name = k.toLowerCase();
      if (/status|finish|complete|progress|time|duration|score/.test(name)) {
        var val = '?';
        try { val = (t === 'function') ? JSON.stringify(o[k]()) : JSON.stringify(o[k]); } catch (e) { val = 'ERR'; }
        out.push(k + ':' + t + '=' + String(val).substring(0, 40));
      }
    }
    return out.join(' | ') || 'NO_FIELD';
  } catch (e) { return 'ERR:' + e.message; }
})()
```

**找到形如 `status() === 1` 或 `progress >= 95` 的字段，就是判据。**

### 2.2 次选：抓心跳 / 上报接口

若找不到模型，看网络层。平台通常定期上报进度：

```javascript
(function(){
  var rs = performance.getEntriesByType('resource');
  var out = [];
  rs.forEach(function(r){
    if (/log|heart|progress|study|learn|report|record|play/i.test(r.name)) {
      out.push(r.name.substring(0, 140));
    }
  });
  return out.slice(-15).join('\n') || 'NO_REPORT_URL';
})()
```

看到类似 `.../log?playingTime=123&duration=600` 的请求，就说明：
完成判据 ≈ `playingTime >= duration`，且**它是按真实时间累计的**（因为参数名是 playingTime）。

必要时开 `bsk network` 看请求体，确认字段含义。**不要伪造上报接口的请求**——用真实播放完成它。

### 2.3 兜底：UI 文本

实在找不到，才用页面上「已观看 85%」「已完成」这类文字。
但要注意：这类文本可能是缓存或四舍五入，**必须用刷新后的值二次确认**。

---

## 阶段 3：确定计时粒度（决定能不能倍速）

这一步决定了你是能 6 倍速跑完，还是必须老老实实 1x。

**实验协议：**

1. 记录初始状态：`ct0`（播放位置）、`acc0`（累计时长字段，若有）。
2. 设 `video.playbackRate = 4`，播放。
3. 等 **60 秒**（用 `sleep 60`，期间不动页面）。
4. 再读：`ct1`、`acc1`。

判读：

| 观察结果 | 结论 |
|---|---|
| `ct1 - ct0 ≈ 240s` 且 `acc1 - acc0 ≈ 240s` | **按位置累计 → 可以倍速** |
| `ct1 - ct0 ≈ 240s` 但 `acc1 - acc0 ≈ 60s` | **按真实时间累计 → 只能 1x** |
| `ct1 ≈ ct0`（位置不动） | 视频被暂停/挂起（看 `paused`、`document.visibilityState`） |

> 记得实验结束后把 `playbackRate` 恢复成平台允许的值再正式跑。

---

## 阶段 4：识别反挂机机制

在前端源码里搜关键词，比盲试快得多：

```javascript
(function(){
  var out = [];
  performance.getEntriesByType('resource').forEach(function(r){
    if (r.name.endsWith('.js')) out.push(r.name);
  });
  return out.slice(-25).join('\n');
})()
```

拿到 JS 列表，挑名字可疑的（`timer`、`action`、`monitor`、`player`、`viewmodel`）下载下来 grep：

```bash
curl -s "<JS_URL>" -o probe.js
grep -nE 'NoAction|visibilitychange|hasFocus|blur|idle|playingTime|心跳|走神|暂停' probe.js
```

常见两类：

1. **无动作超时**（如 `NoAction(10*60*1000)`）→ 定时发真实输入事件（鼠标移动/点击）可续命；
2. **可见性门控**（`document.visibilityState`）→ 只能保证标签页在前台，不能靠脚本绕过。

看到 `visibilitychange` 且有 `hidden` 分支，就**不要**尝试多标签并行。

---

## 阶段 5：最小闭环（先跑一个单元）

选一个最短的视频 / 最简单的一道题，验证：

1. 能启动播放；
2. 判据能变成"完成"；
3. 刷新后状态仍然保持（说明服务端记录了，不是纯前端）。

**刷新验证是关键。** 前端改状态容易，服务端认不认才决定你有没有白干。

---

## 阶段 6：批量执行

确认最小闭环后：

1. 找出"下一个任务点"的稳定入口（通常是「下一页」「下一节」按钮，或目录树里下一个节点）；
2. 写一个循环：执行 → 轮询判据 → 刷新校验 → 下一个；
3. **串行**，不要并行；
4. 每完成一个单元，把结果追加到日志文件，便于中断后恢复。

建议结构：

```bash
for unit in <单元列表>; do
  navigate "$unit"
  do_task            # 播放/答题
  wait_until_done    # 轮询判据
  verify "$unit"     # 刷新 + 读判据
  echo "$unit $(date +%H:%M:%S)" >> progress.log
done
```

---

## 阶段 7：最终验证

刷新课程总览页，逐项核对目标单元的进度/分数。
如果界面上有"已完成"标记，仍然用判据复核一遍。

前端展示有延迟时，导航一次（上一页/下一页）触发同步，再刷新。

---

## 禁止事项

1. **不要伪造上报请求 / 篡改服务端数据。** 只做"把内容真实播完"这件事。
2. **不要并行开多个学习页**，除非确认平台没有可见性/并发检测。
3. **不要猜测或输入账号密码**；登录失效就请求人工。
4. **不要重复借用标签页**；`borrow` 超时先查 `tab list --scope agent`。
5. **同一错误不重试超过 2 次**，停下来报告。
6. **不要删改用户的课程内容/笔记/作业答案**，只操作学习进度。

---

## 输出要求

### 报告 1：平台分析卡（动手前先给用户看）

```
平台：<域名>
页面结构：iframe 层数 / 是否 shadow DOM
完成判据：<字段或接口>     可靠度：高/中/低
计时粒度：按位置 / 按真实时间
可倍速：是 / 否（上限 X 倍）
反挂机：无 / 无动作超时（N 分钟）/ 可见性门控
建议策略：<一句话>
```

### 报告 2：执行结果

```
| 单元 | 状态 | 判据值 | 备注 |
|---|---|---|---|
| … | 完成/失败 | … | … |

总计：X 完成 / Y 失败
异常与遗留：
- …
```

如果卡住，说明卡在哪个阶段、观察到什么、下一步建议什么人工操作。
