# 故障速查总表

> 按「症状」查，而不是按平台查。

---

## 1. 环境层

| 症状 | 原因 | 处理 |
|---|---|---|
| `ls/head/grep: command not found` | Git Bash 缺 coreutils | PATH 前置 PortableGit 的 `usr/bin` |
| 每条命令 `pid` 都变、session 丢失 | 宿主杀了后台 daemon | `bsk daemon start --foreground` 放持久后台任务 |
| `session not registered` | 同上，或 BSK_HOME 不一致 | 统一 `BSK_HOME` + 常驻 daemon |
| `browsers: []` | 扩展未连接 / 浏览器关闭 | 打开浏览器等重连；`bsk doctor` 确认 |
| PowerShell 执行无输出也不报错 | 多行内联脚本限制 | 改用脚本文件或 Git Bash |
| `evaluate` 返回 `{}` | 表达式不是 IIFE | `(function(){...})()` |
| `operation denied by the Agent Window sandbox` | 目标元素不可见 | 点 label / 原生 click / 直接改模型 |
| `error: operation timed out`（borrow） | 等待用户确认超时 | 用 `tab list --scope agent` 确认是否已借到，别重复借 |
| stale ref / 点错元素 | refs 被新的 observe 冲掉 | observe 后立刻用；复杂场景用 CSS 选择器 |

---

## 2. 视频层

| 症状 | 原因 | 处理 |
|---|---|---|
| `NO_VIDEO` / `duration=0` | 播放器未初始化或流未加载 | 等 5~8s 重试；切页再回来重建播放器 |
| 播放位置反复归零 | HLS token 过期 / 播放器重连 | 无视；若平台按累计时长计，进度不受影响 |
| 进度不涨 | 视频暂停（弹窗/失焦） | 点「继续学习」/ 重新 `play()` |
| 倍速无效、进度追不上 | 平台按真实时间累计 | 只能 1x（智慧课程） |
| 2x 可用但原生 UI 只有 2x | UI 限制 | `video.playbackRate = 4~6`（优学习可） |
| 拖进度条被弹回 | maxPositionTime 防拖拽 | 正常机制，用倍速代替拖拽 |
| tab 转后台就暂停 | visibility 门控 | 串行操作，播放期间别动其它 tab |

---

## 3. 答题层

| 症状 | 原因 | 处理 |
|---|---|---|
| 选项点了没反应 | 目标是隐藏 input | 点外层 `a.choice-item` / `span.num_option` |
| 提交后 `confirmed:null` | 确认按钮文本/选择器不对 | 智慧课程是 `#popok`（文本"提交"）；优学习提交即生效 |
| `no quiz doc` | 题目 iframe 未加载 | 等 3~5s 重跑 |
| 提交后成绩没变 | 前端缓存 / 未同步 | 离开该页翻一页，再刷新列表 |
| 限答 1 次不敢点 | 需要预校验 | 回读 `selected` / `check_answer` 再提交 |

---

## 4. 进度验证层

| 症状 | 原因 | 处理 |
|---|---|---|
| 列表页仍是 0% | 页面缓存 | 刷新列表页 |
| 某章 75% / 80% | 有任务点未完成或未同步 | 进该章看三处：材料 / 视频 status / 练习成绩 |
| 练习全对但分数没加 | 成绩异步同步 | 翻页触发，等 5~10s 再刷新 |
| 目录树误报 PENDING | 用 textContent 扫全树的土办法 | 改用 `span.icon_Completed` 判据 |

---

## 5. 排障决策树

```
任务没完成
├─ 页面打不开 / 跳登录 → 登录态（CAS）过期 → request-help
├─ 视频不播
│   ├─ 没有 video 元素 → 不是视频页 / 播放器未初始化
│   ├─ 有 video 但 ct 不动
│   │   ├─ paused=true → 点播放 / 弹窗挡住 → 点「继续学习」
│   │   └─ paused=false 但 ct 不动 → 流坏了 → 切页重建播放器
│   └─ ct 在涨但进度不涨 → 该平台按真实时间计 → 只能用 1x
├─ 视频 OK 但章节还是 PENDING
│   ├─ status 已 =1 → 前端缓存/未同步 → 翻页 + 刷新
│   └─ status =0 → 继续播
└─ 练习问题
    ├─ 找不到题目 → 等 iframe / 检查入口按钮
    ├─ 选了没选中 → 点外层容器
    └─ 提交无反应 → 确认弹窗选择器不对
```

---

## 6. 一条经验

> **不要相信 UI 文本，相信数据模型。**
>
> "已观看 95%""已完成"这些文字随时可能因为缓存、i18n、样式而不可靠；
> 真正决定成绩的是 `record().status()`、`playingTime`、`icon_Completed` 这类字段。
> 先找到字段，再谈自动化。
