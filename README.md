# HUST 网课自动化实战手册

> 华中科技大学（HUST）校内两类网课平台的**真实实测**自动化经验与可直接复用的脚本：
> **优学习 Ulearning**（`courseweb.ulearning.cn`）与 **智慧课程 SmartCourse**（`smartcourse.hust.edu.cn`）。
>
> 不是"教程搬运"，全部结论来自实际跑通整门课的过程，包含踩过的坑、失效过的方案和最终有效的判据。

---

## 1. 核心结论（先看这个，能省几小时）

### 1.1 三个"看起来是障碍、其实不是"的东西

| 现象 | 真实影响 | 结论 |
|---|---|---|
| 反挂机弹窗「走神太久啦，计时君停止工作」 | 只暂停计时器 + 暂停播放 | **不影响已累计的观看时长**，点掉继续即可 |
| 视频突然归零重载（HLS token 过期 / 播放器重连） | 播放位置回到 0 | **不影响累计时长**，因为平台按 `timeupdate` 增量累加 |
| 课程页进度百分比不更新 | 只是前端缓存 | 刷新页面 / 翻一页触发同步即可看到真实进度 |

### 1.2 每个平台只有两件事要搞清楚

1. **完成判据在哪** —— 不要用"看完没有"的肉眼判断，去读平台自己的数据模型：
   - 优学习：`record().status() === 1`（由 `viewProgress >= 95` 触发）
   - 智慧课程：目录树的 `span.icon_Completed`（由心跳上报的 `playingTime >= duration` 触发）
2. **平台允许什么速度** —— 两家平台规则完全不同：
   - 优学习：**可以倍速**。`video.playbackRate = 6` 实测有效，观看进度按视频位置累计。
   - 智慧课程：**必须 1x**。`playingTime` 只按真实时间累计，2x 永远追不上 duration。

### 1.3 平台对比

| | 优学习 Ulearning | 智慧课程 SmartCourse |
|---|---|---|
| 域名 | `courseweb.ulearning.cn` / `ua.ulearning.cn` | `smartcourse.hust.edu.cn` |
| 技术栈 | Knockout + MediaElement.js + hls.js | iframe 三层嵌套 + video.js |
| 单章结构 | 若干「授课视频」+「章节练习」 | 视频 + 材料 + 选择题（单元测试章只有题） |
| 可倍速 | ✅ 实测 6x 有效 | ❌ 必须 1x 真实播放 |
| 反挂机 | 10 分钟无鼠标动作弹窗 | tab 转后台即暂停 + 心跳停发 |
| 并行 | 单 tab 串行 | 单 tab 串行（且必须前台可见） |
| 完成判据 | `record().status()==1` | 目录树 `icon_Completed` |
| 练习 | 5 题单选，限答 1 次 | 可重复，选中即提交 |

---

## 2. 快速开始

### 2.1 前置条件

- Windows / macOS / Linux 均可，示例以 Windows + Git Bash 为主
- [browser-skill](https://github.com/Tencent/BrowserSkill)（`bsk` CLI + 浏览器扩展），浏览器里**已登录**对应课程平台
- Node.js / Python 非必需，脚本仅依赖 `bsk` + `bash` + `curl`

### 2.2 环境初始化

```bash
# bsk 通常在 ~/.local/bin（Windows 下是 bsk.exe）
export PATH="$HOME/.local/bin:$PATH"
export BSK_AUTO_START=0

# daemon 必须常驻，否则两次 shell 调用之间 session 会丢
bsk daemon start --foreground   # 放到持久后台任务里运行

# 新开一个终端验证
bsk status --json | grep '"pid"'
bsk session start --json        # 记下 session_id
bsk tab list --scope user --session <session_id>
```

> ⚠️ 很多宿主（包括 WorkBuddy）会**在每次 shell 调用后杀掉后台子进程**。此时 daemon 会不断重启、PID 变化，session 在两次命令之间失效。解决办法是让 daemon 跑在宿主认可的持久后台任务里。详见 [`docs/03-bsk-environment.md`](docs/03-bsk-environment.md)。

### 2.3 优学习：跑一章

```bash
cd tools/ulearning
./watch_one.sh <session_id> stay     # 当前页视频：6x 播放 + 轮询 status
./watch_one.sh <session_id> next     # 点「下一页」，然后再跑一遍
```

### 2.4 智慧课程：跑一批

```bash
cd tools/smartcourse
# 1) 从浏览器地址栏复制固定参数，填入 config.sh
cp config.example.sh config.sh && vi config.sh
# 2) 批量跑（chapterId 列表）
bash batch_run.sh <tab_id> 100001 100002 100003
```

### 2.5 不想自己动手？把提示词直接丢给 Agent

`prompts/` 下有三份**自包含**的提示词模板，复制粘贴即可让任意具备 bsk 能力的 Agent 独立完成任务：

| 模板 | 适用场景 |
|---|---|
| [`prompts/01-ulearning.md`](prompts/01-ulearning.md) | 优学习 / 思政类网课 |
| [`prompts/02-smartcourse.md`](prompts/02-smartcourse.md) | 智慧课程 / 大学英语词汇课 |
| [`prompts/03-generic-platform.md`](prompts/03-generic-platform.md) | 没见过的平台（教 Agent 自己逆向判据） |

模板里已经内置：环境自检、完成判据、防错规则（不许并行 / 不许猜密码 / 练习先校验后提交）、
异常处理表、以及**强制输出逐章验证表**。详见 [`prompts/README.md`](prompts/README.md)。

---

## 3. 仓库结构

```
.
├── docs/
│   ├── 01-ulearning.md          # 优学习：页面结构、完成判据、6x 方案、答题流程
│   ├── 02-smartcourse.md        # 智慧课程：三层 iframe、1x 规则、quizdo 脚本详解
│   ├── 03-bsk-environment.md    # bsk 环境、daemon 保活、evaluate/ref 的坑
│   └── 04-pitfalls.md           # 故障速查总表
├── prompts/
│   ├── README.md                # 三份模板怎么选、占位符怎么填
│   ├── 01-ulearning.md          # 优学习：可整段粘给 Agent 的任务提示词
│   ├── 02-smartcourse.md        # 智慧课程：同上（含自包含脚本）
│   └── 03-generic-platform.md   # 陌生平台：逆向方法论提示词
├── tools/
│   ├── env.sh                   # 环境初始化（PATH / BSK_AUTO_START / SESSION）
│   ├── ulearning/
│   │   ├── watch_one.sh         # 单视频：倍速播放 + status 轮询
│   │   ├── probe_status.js      # 读取当前页元素的 status / viewProgress / viewTime
│   │   ├── verify_choices.js    # 提交前校验选项是否真的选中
│   │   └── README.md
│   └── smartcourse/
│       ├── config.example.sh    # 课程参数模板（从 URL 复制）
│       ├── matfin.js            # 材料任务点：一次 XHR 标记完成
│       ├── vidmodplay.js        # 启动视频播放（自动静音、1x）
│       ├── viddiag.js           # 视频状态诊断（供轮询）
│       ├── quizdo.js            # 选择题/单元测试自动作答 + 提交
│       ├── treestat.js          # 读取目录树完成状态（可信判据）
│       ├── run_chapter.sh       # 单章流水线
│       ├── batch_run.sh         # 多章批处理 + 逐章验证
│       ├── finish_video.sh      # 超长视频/中断后续播补完
│       └── README.md
├── LICENSE
└── README.md
```

---

## 4. 方法论：怎么给一个陌生的网课平台做自动化

这套流程对任何"看视频 + 做题"的课程平台都适用：

1. **摸清判据，别猜 UI**
   打开页面 → 找到 `window` 上的视图模型（Knockout/Vue/React 都能从 DOM 上 `__ko__` / `__vue__` 摸到）→ 直接读"完成"字段。
   优学习就是 `koLearnCourseViewModel.currentPage().pageElements()[i].record().status()`。

2. **确认计时的粒度**
   是"到达过某个位置"还是"累计真实时间"？
   - 试着设 `playbackRate=4`，观察计数字段增长速度。
   - 若按位置增长 → 可以倍速；若按真实时间增长 → 老实用 1x。

3. **识别反挂机机制**
   搜前端源码里的关键词：`NoAction`、`visibilitychange`、`hasFocus`、`playingTime`、`走神`、`暂停`。
   优学习的实现就在 `js/tools/NoAction.js` + `learnCourseViewModel.js` 里，一眼看穿。

4. **提交前做校验**
   答题类操作多半"限答 1 次"，点完必须回读 DOM/模型确认选中，再提交。

5. **验证闭环**
   每章跑完刷新列表页，读分数/百分比。前端展示可能延迟，必要时翻页触发同步。

---

## 5. 免责声明

- 本项目是**个人学习效率工具**与平台机制研究记录，不包含任何账号、密码、Cookie 或课程私有数据。
- 使用前请确认符合所在学校/平台的课程规定；因使用产生的后果由使用者自行承担。
- 平台前端随时可能改版，脚本中的选择器与判据需要按 `docs/04-pitfalls.md` 的思路重新定位。

---

## License

MIT
