# 智慧课程工具

配合 [`docs/02-smartcourse.md`](../../docs/02-smartcourse.md) 使用。

## 首次配置

```bash
cp config.example.sh config.sh
vi config.sh     # 填 courseId / clazzid / cpi / enc / openc / session / tab
```

参数从浏览器地址栏复制一次，整门课通用；只有 `chapterId` 会变。

## 文件

| 文件 | 作用 |
|---|---|
| `matfin.js` | 材料任务点：一次 XHR 标记完成 |
| `vidmodplay.js` | 启动视频（静音 + 锁 1x） |
| `viddiag.js` | 视频状态诊断（轮询用） |
| `quizdo.js` | 选择题/单元测试自动作答 + 提交 + 确认弹窗 |
| `treestat.js` | 读目录树完成状态（可信判据） |
| `run_chapter.sh` | 单章完整流水线 |
| `batch_run.sh` | 多章批处理 + 逐章验证 |
| `finish_video.sh` | 超长视频/中断后续播补完 |

## 用法

```bash
# 单章
bash run_chapter.sh 582278

# 多章（建议后台）
bash batch_run.sh $SC_TAB_ID 582278 582279 582280
tail -f batch.log | grep -E 'START|VERIFY|QUIZ'

# 超长视频补播
bash finish_video.sh
```

## 期望输出

```json
{"clicked":true,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
```

单元测试章：

```json
{"clicked":false,"answered":26,"total":26,"submitted":"提交-cls","confirmed":"popok"}
```

`clicked:false` 是正常的——单元测试章没有「练习题」入口，题目由 iframe 直载。

## 三条铁律

1. **必须 1x**，不能倍速、不能拖拽、不能后台。
2. **播放期间不要操作别的标签页**（`--tab-id` 会激活目标 tab，导致播放页转后台暂停）。
3. **验证用 `treestat.js`**，不要看页面文字。
