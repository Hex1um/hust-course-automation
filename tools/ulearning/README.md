# 优学习工具

配合 [`docs/01-ulearning.md`](../../docs/01-ulearning.md) 使用。

## 文件

| 文件 | 作用 |
|---|---|
| `watch_one.sh` | 单视频：设 6x → 播放 → 轮询 `status()` → 自动点掉「走神」弹窗 |
| `probe_status.js` | 读取当前页 `status / viewTime / progress / 播放位置` |
| `verify_choices.js` | 提交前校验每题选中项 |

## 典型流程

```bash
source ../env.sh
export SESSION=<你的 session_id>

# 借标签页（已在课程页）
bsk tab list --scope user --session $SESSION
bsk tab borrow <TAB_ID> --session $SESSION
bsk tab list --scope agent --session $SESSION   # 确认已借到

# 进入某一讲（点「开始学习」，会新开学习页）
bsk observe --session $SESSION | grep '开始学习'
bsk click @eNN --session $SESSION

# 依次过每一节
./watch_one.sh $SESSION stay      # 第一节
./watch_one.sh $SESSION next      # 第二节
./watch_one.sh $SESSION next      # …直到 NO_VIDEO

# 到练习页
bsk observe --session $SESSION | sed -n '/限答/,/提交/p'
# …逐题点选…
bsk evaluate "$(cat verify_choices.js)" --session $SESSION
# 确认无误后提交
bsk click @eNN --session $SESSION
bsk observe --session $SESSION | grep -c '回答正确'

# 回列表页刷新看成绩
bsk evaluate "location.reload()" --tab-id <LIST_TAB> --session $SESSION
```

## 判读要点

- `VIDEO_DONE` = `status=1`，**不需要等到播放进度 100%**
- `NO_VIDEO` = 已到练习/图文页，属正常
- 视频归零不用慌：`viewTime` 是累计的，重播只会让数字更大
- 练习限答 1 次，**先 verify 再提交**
