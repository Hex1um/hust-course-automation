# bsk 环境与工具坑

> 这一篇不看，前面两篇的脚本基本跑不起来。
> 环境：Windows 10/11 + Git Bash + Edge + browser-skill（`bsk` CLI）

---

## 1. 安装与路径

`bsk` 通常安装在：

| 平台 | 路径 |
|---|---|
| Windows | `C:\Users\<你>\.local\bin\bsk.exe` |
| macOS / Linux | `~/.local/bin/bsk` |

它**不一定在 PATH 里**，先确认：

```bash
command -v bsk || ls ~/.local/bin/bsk*
```

没有就手动加：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

浏览器扩展需要在 Edge/Chrome 里装好并连接。检查：

```bash
bsk status --json
```

正常输出包含 `browsers` 数组、`pid`、`sock_path`。
`browsers: []` 表示扩展没连上——打开浏览器等它自动重连，或重装扩展。

---

## 2. daemon 保活（Windows 上最大的坑）

### 症状

- 每条 `bsk` 命令的 `pid` 都不一样
- `session start` 返回了 `session_id`，但下一条命令 `session list` 是空的
- 报错 `session not registered or already stopped`

### 原因

很多宿主（WorkBuddy、部分 IDE 终端）**会在每次 shell 调用结束后杀掉该调用派生的后台子进程**。
bsk 的 daemon 是后台子进程 → 每次调用后被回收 → 下次命令重新拉起一个空 daemon → session 丢失。

### 解决

把 daemon 放到宿主的**持久后台任务**里：

```bash
# 关键：run_in_background = true
bsk daemon start --foreground
```

然后**另开一次调用**验证（不要在同一次调用里既启动又使用）：

```bash
export BSK_AUTO_START=0
bsk status --json | grep -E '"pid"|"uptime_secs"'
```

稳定后 `uptime_secs` 会持续增长、`pid` 不变。
后续所有命令都带上同一组环境变量：

```bash
export BSK_AUTO_START=0
```

> `BSK_AUTO_START=0` 的作用是禁止 CLI 自行拉起临时 daemon，
> 避免"你以为在用持久 daemon，其实被拉起了另一个"。

`BSK_HOME` 默认是 `~/.bsk`，如果你想隔离多个环境可以显式指定：

```bash
export BSK_HOME="$HOME/.bsk-work"
```

**同一次会话里所有命令的 `BSK_HOME` 必须一致**，否则会连到不同 socket。

---

## 3. Git Bash 环境残缺

部分环境的 PortableGit 只带了 `bash.exe`，缺 coreutils，表现为：

```
ls: command not found
head: command not found
dirname: command not found
```

把 PortableGit 的 `usr/bin` 加到 PATH 最前面：

```bash
export PATH="/c/Users/<你>/.workbuddy/binaries/PortableGit/versions/<版本>/usr/bin:$PATH"
```

确认：

```bash
ls --version | head -1
```

> 如果宿主同时提供 PowerShell 工具，也可以用 PowerShell 跑 bsk，
> 但**多行内联脚本容易静默失败**（见下一节），长流程还是 Git Bash + 脚本文件更稳。

---

## 4. 宿主 shell 的坑

### 4.1 PowerShell 多行内联不可靠

在部分宿主里，PowerShell 工具执行多行脚本 + 变量 + 原生命令组合时，
可能返回 exit code 0/1 但**不产生任何输出、也不写文件**。

对策：

- 简单命令用 PowerShell；
- 多步骤流程写 `.ps1` 或 `.sh` 文件，再用工具执行文件；
- 或者统一用 Git Bash。

### 4.2 每次 Bash 调用都是全新 shell

`export` 不会跨调用保留。**每条命令都要重新 export**：

```bash
export PATH="$HOME/.local/bin:$PATH"
export BSK_AUTO_START=0
bsk ...
```

或者写一个 `env.sh`，每次 `source`：

```bash
source tools/env.sh
```

### 4.3 相对路径的工作目录不一定是你以为的

不同工具（Bash / PowerShell）的初始工作目录可能不同。
**统一用绝对路径**，或先 `cd` 到固定目录。

---

## 5. bsk 命令使用要点

### 5.1 `evaluate` 必须是 IIFE

```js
// ❌ 返回函数对象，被序列化成 {}，无报错——静默失败
() => { return 1 }

// ✅
(function(){ return 1; })()
```

### 5.2 长 JS 先写文件

bash 里内联长 JS 的引号转义必炸：

```bash
# ❌
bsk evaluate "(function(){var s='...';return s})()"

# ✅
bsk evaluate "$(cat script.js)" --session $S
```

### 5.3 refs 会被下一次 observe 冲掉

`bsk observe` 返回的 `@eN` 只在**当前这次观察**有效。
每次导航、DOM 大改、重新 observe 之后，ref 都会换一批。

```bash
# 正确姿势：observe → 立即用 ref
bsk observe --session $S | grep '开始学习'
bsk click @e33 --session $S

# 错误：隔了几条 observe 再用旧 ref → stale ref
```

拿不到稳定 ref 时，用 CSS 选择器：

```bash
bsk click --selector 'input[value="2.00"] ~ label' --session $S
```

### 5.4 沙箱会拒绝点击不可见元素

报错：

```
error: operation denied by the Agent Window sandbox
```

常见于隐藏的 radio/checkbox（自定义样式的播放器、下拉菜单）。
对策：

- 点它的可见 label；
- 或者直接用 `evaluate` 触发原生 `click()`；
- 或者直接改数据模型（如 `video.playbackRate = 6`）。

### 5.5 `tab borrow` 超时不代表失败

借用户标签页时可能报：

```
error: operation timed out
```

但很可能**已经借到了**。用这个确认：

```bash
bsk tab list --scope agent --session $S   # 出现在这里 = 借到了
bsk tab list --scope user  --session $S   # 这里消失 = 已移交
```

不要在没确认的情况下反复 borrow。

### 5.6 版本 skew 通常不影响使用

```
daemon_version: 0.2.1  /  extension_version: 0.3.0
version_skew: true
```

`bsk doctor` 会明确写 "still usable, upgrade soon"。
除非某个命令明确报协议不支持，否则不用折腾升级。

### 5.7 收尾

```bash
bsk tab return <TAB_ID> --session $S   # 归还用户标签页（保持打开）
bsk session stop $S                     # 结束会话
```

`session stop` 后标签页会留在用户窗口里，不会关闭。

---

## 6. 调试三件套

```bash
# 1) 环境是否健康
bsk doctor

# 2) 现在有哪些标签页 / 会话
bsk status --json
bsk session list --json
bsk tab list --scope agent --session $S

# 3) 页面到底渲染了什么
bsk observe --session $S | head -60
bsk get-html --session $S --out page.html      # 完整 DOM，适合 grep
bsk screenshot --session $S --out shot.png      # 直观确认
```

> `get-html` 只能看到主文档；iframe / shadow DOM 内容需要 `evaluate` 进去读。
