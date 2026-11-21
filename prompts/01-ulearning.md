# 优学习（Ulearning）刷课 Agent 提示词

> **用法**：把下面分割线以下的全部内容，作为一条消息粘给具备 `browser-skill`（bsk CLI）能力的 Agent。
> 只需替换 `<章节列表>`、`<课程名称>` 两个占位符。

---

## 任务

你是一名浏览器自动化执行者。使用 `browser-skill`（`bsk` CLI）操作用户**已经登录**的浏览器，完成优学习（`courseweb.ulearning.cn`）课程《<课程名称>》的指定章节，包括**每一个授课视频**和**每一套章节练习**。

目标章节：**<章节列表>**（例如：第 10、12、14、15、16 讲）

### 成功标准（缺一不可）

1. 每个视频任务点在数据模型里 `status() === 1`；
2. 每套章节练习已提交，且 5 题全部「回答正确」；
3. 最终在课程列表页刷新后，目标章节显示 **进度 100%、分数 100**。

不要用"页面看起来完成了"作为完成依据，必须走第 5 步的验证。

---

## 一、环境自检（先做，不通过就停）

```bash
export PATH="$HOME/.local/bin:$PATH"
export BSK_AUTO_START=0

# 1) daemon 是否常驻
bsk status --json | grep -E '"pid"|"uptime_secs"'

# 2) 浏览器是否连接
bsk status --json | grep -A3 '"browsers"'

# 3) 开一个会话
bsk session start --json
```

判断：

- `browsers` 为空 → 浏览器扩展没连上，提示用户打开浏览器，**不要自己反复重启**。
- 两次命令的 `pid` 不一样、或 `session list` 是空的 → 宿主在杀后台进程。改用持久后台任务启动 `bsk daemon start --foreground`，然后**在另一次调用里**再验证。
- `session start` 返回的 `session_id` 记下来，后面每条命令都带 `--session <id>`。

登录态检查：随便 `bsk observe` 一下课程页，
若跳转到登录页或出现"请登录"，用 `bsk request-help --session <id> --prompt "请人工完成登录"`，**不要询问或猜测账号密码**。

---

## 二、铁律（每一条都用真实事故换来的）

1. **严格串行。** 同一时间只操作一个学习标签页；不要开多个章节页并行，平台会判定异常。
2. **只信数据模型。** 页面上的「已观看 XX%」「已完成」可能是缓存；完成判据是 `status()`。
3. **练习限答 1 次。** 提交前必须回读选中项，确认无误再点提交。
4. **视频归零不用慌。** 平台按 `timeupdate` 的播放位置**增量累计**，HLS 流重连导致位置回到 0 也不清零已累计时长；继续播即可。
5. **"走神"弹窗不用慌。** 它只暂停播放和计时，不影响累计；点掉「继续学习」继续。
6. **不要重复借用标签页。** `tab borrow` 超时可能已经借成功，先用 `tab list --scope agent` 确认。
7. **同一错误不重试超过 2 次。** 仍失败就停下来报告，不要空转。

---

## 三、操作流程

### 第 1 步：拿到课程标签页

```bash
bsk tab list --scope user --session <SESSION>
bsk tab borrow <TAB_ID> --session <SESSION>
bsk tab list --scope agent --session <SESSION>   # 确认标签已移交
```

如果用户没有打开课程页，自己导航：

```bash
bsk navigate "https://courseweb.ulearning.cn/ulearning/index.html#/course/textbook?courseId=<COURSE_ID>" --session <SESSION>
```

### 第 2 步：进入目标章节

课程页是一张章节表格，每行有「开始学习 / 继续学习」按钮：

```bash
bsk observe --session <SESSION> | grep -E '第.*讲|开始学习|继续学习'
bsk click @eNN --session <SESSION>
```

点击后会**新开一个学习页标签**（`ua.ulearning.cn/learnCourse/learnCourse.html?...`），这是正常流程。记下这个标签的 tab id，后续所有操作都在它上面。

如果某章节已在学习页，直接跳到第 3 步。

### 第 3 步：逐个视频完成

学习页左侧是目录（节 + 授课视频），右侧是内容区，底部有「下一页」。

对每一页循环执行：

**3.1 启动播放（6 倍速）**

```javascript
(function(){
  var v = document.querySelector('video');
  if (!v) return 'NO_VIDEO';
  v.playbackRate = 6;
  v.play();
  return 'rate=' + v.playbackRate + ' t=' + v.currentTime.toFixed(0);
})()
```

```bash
bsk evaluate "<上面的 JS>" --session <SESSION>
```

`NO_VIDEO` 表示当前页不是视频页（已到练习或图文页），进入第 4 步。

**3.2 轮询完成状态（每 12 秒一次，最多 30 次）**

```javascript
(function(){
  try {
    var pg = window.koLearnCourseViewModel.currentPage();
    var els = pg.pageElements();
    var out = '';
    for (var i = 0; i < els.length; i++) {
      var r = els[i].record();
      out += r.status() + '|' + Math.round(r.viewTime()) + '|' + r.viewProgress() + ';';
    }
    var v = document.querySelector('video');
    return out + ' t=' + (v ? v.currentTime.toFixed(0) : '-');
  } catch (e) { return 'ERR:' + e.message; }
})()
```

输出形如 `0|527|93.3; t=540`：

- 出现 `1|`（任意元素 status=1）→ **该视频完成，翻页**；
- `viewTime` 不涨 → 播放暂停或卡住，执行下一条续播；
- `ERR` → 页面还没加载好，等 8 秒重试。

**3.3 每轮顺手做两件事（幂等，无害）**

关闭"走神"弹窗：

```javascript
(function(){
  var bs = document.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) {
    if (bs[i].textContent.indexOf('继续学习') >= 0) { bs[i].click(); break; }
  }
  return 1;
})()
```

续播：

```javascript
(function(){
  var v = document.querySelector('video');
  if (v) { v.playbackRate = 6; if (v.paused) v.play(); }
  return 1;
})()
```

**3.4 翻到下一页**

```bash
REF=$(bsk observe --session <SESSION> | grep -E 'button "下一页"' | head -1 | grep -oE '@e[0-9]+' | head -1)
bsk click $REF --session <SESSION>
sleep 4
```

然后回到 3.1。直到 `NO_VIDEO` 或页面标题变成「页面一」。

> 如果某视频是空的占位（`video` 存在但 `duration=0`、位置不动）：
> 切到别的节再切回来重建播放器；仍不行就跳过并记录到报告。

### 第 4 步：章节练习

**4.1 读题**

```bash
bsk observe --session <SESSION>
```

找到「共 N 题 · 限答 1 次」和每题题干、四个选项（`A.`~`D.`）。

**4.2 作答**

题目都是教材原文级知识点。按教材表述选择：
- 注意「唯一 / 根本 / 宗旨 / 前提 / 保证 / 基础」这类固定搭配；
- 「错误的是」题型先排除明显违背教材立场的选项；
- 不确定时优先选与本章标题直接相关的表述。

**4.3 点选**

```bash
bsk click @eNN --session <SESSION>     # 每个选项一个 ref
```

**4.4 提交前强制校验**

```javascript
(function(){
  var items = document.querySelectorAll('a.choice-item');
  var out = [], q = 0, cnt = 0, sel = '';
  for (var i = 0; i < items.length; i++) {
    var c = items[i].querySelector('.checkbox');
    if (c && c.classList.contains('selected')) sel += String.fromCharCode(65 + (i % 4));
    cnt++;
    if (cnt % 4 === 0) { out.push('Q' + (++q) + ':' + (sel || '-')); sel = ''; }
  }
  return out.join(' ');
})()
```

输出应为 `Q1:C Q2:B Q3:B Q4:D Q5:A` 这种形式，且每题都不是 `-`。
**如果与预期不符，先修正再提交**——只有一次机会。

**4.5 提交并确认**

```bash
bsk click @eNN --session <SESSION>        # 提交按钮
bsk observe --session <SESSION> | grep -c '回答正确'
```

应有 5 条「回答正确！」。若出现「回答错误」，记录到报告（无法重答）。

### 第 5 步：下一章

回到课程列表标签页，点击下一章的「开始学习」，重复第 2~4 步。

### 第 6 步：验证（必做）

```bash
# 刷新课程列表页
bsk evaluate "location.reload(); 'reloading'" --tab-id <LIST_TAB> --session <SESSION>
sleep 12
bsk observe --tab-id <LIST_TAB> --session <SESSION> | grep -E '第.*讲'
```

逐个核对目标章节的「进度 / 累计学习时间 / 分数」。

注意：

- 练习提交后成绩可能延迟同步。若某章差一档（如 75%），回到学习页**翻一页再翻回来**触发同步，再刷新列表页。
- 若刷新后仍是低值，进该章用第 3.2 步的 JS 检查每个元素的 `status`，找出没完成的那个。

---

## 四、异常处理

| 现象 | 处理 |
|---|---|
| `bsk` 找不到 | `export PATH="$HOME/.local/bin:$PATH"` |
| 两次命令 `pid` 不同 / session 丢失 | 持久后台任务跑 `bsk daemon start --foreground`，再验证 |
| `session not registered` | 重新 `session start`，后续命令带新 id |
| 登录页 / 请登录 | `bsk request-help` 请用户接管，不要猜密码 |
| `operation denied by the Agent Window sandbox` | 目标是隐藏元素，改用 `evaluate` 直接操作 |
| `error: operation timed out`（borrow） | 用 `tab list --scope agent` 确认是否已借到，不要重复借 |
| `stale ref` / 点到别的元素 | 重新 `observe` 再点；必要时用 CSS 选择器 |
| `NO_VIDEO` | 正常，说明到练习/图文页了 |
| 视频位置不涨 | 先点掉弹窗 + `v.play()`；仍不动则切页重建播放器 |
| 选项点了没选中 | 点外层 `a.choice-item`，不要点内层隐藏 input |
| 提交后页面没反应 | 重新 observe，找新的「提交」ref；确认没有二次弹窗 |

---

## 五、汇报格式（完成后必须给出）

```
## 完成情况

| 章节 | 视频（完成/总数） | 练习 | 进度 | 分数 |
|---|---|---|---|---|
| 第十讲 … | 4/4 | 5/5 | 100% | 100 |
| … | | | | |

总耗时：约 XX 分钟
异常与遗留：
- （如无写"无"）
```

如果中途停止，说明：停在哪一章、哪一步、报什么错、建议的人工操作。
