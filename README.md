# qq-chat-viewer-independent

QQ-style redacted static chat archive.

## 浏览方式

- 日期导航按时间连续浏览，搜索支持文字、回复和转发内容。
- 同一范围内的事件合并成一个入口，保留重点、情绪、连发等多个标签；各分类都能找到该事件，“下一个事件”在当前分类内前进。
- “高峰”是单日消息量的统计标记，不再用整天范围覆盖当天的其他事件。
- 工作、日常对话按连续交流片段分类，默认只显示一行「折叠了 N 条 · 原因」（日常闲聊 / 工作交接 / 工作交接 · 含魔女2未公开内容）；含魔女2未公开内容的片段不能展开，其余折叠片段之外的魔女2消息显示为一行「已隐去 N 条」，同样不能展开，也不出现在搜索结果中；仅有这两类标签的事件不出现在“全部”事件列表中。点分类查看对应事件，再点事件或聊天区摘要展开原文；点击“收起”可再次折叠。
- 涉及报酬、争议、重点事件和现有批注的整段交流保留显示。自动分类采用保守规则，无法明确分类的内容保留显示。
- 正常打开页面或恢复阅读位置时，工作、日常默认折叠；搜索结果及消息直达链接可以打开目标片段。

公开数据本身已脱敏，清理确认的收件人姓名和市级以下具体地址，保留省市、聊天别名、日期、金额和上下文。未公开的魔女2（续作）工作对话共 58 段，文字已在数据中替换为 `*******`，消息编号、时间、发送人、类型和图片 / 文件占位保留。脱敏范围与统计记录在 [privacy-report.json](privacy-report.json)（`supplemental_review`、`sequel_review`）；魔女2 遮盖可用 `node tools/redact-sequel.mjs` 按记录重放，规则见 [sequel-mask.mjs](tools/sequel-mask.mjs)。

2026 年 9 月 14 日的整天讨论（429 条记录）及其他日期中重复引用的原文已替换为 `***`，包括回复、混合消息和转发正文；2025 年 9 月 14 日不按整天处理。范围与字段数见 `sensitive_review`，可运行 `node tools/redact-sensitive.mjs` 重放，规则见 [sensitive-mask.mjs](tools/sensitive-mask.mjs)。

注意：只改写了当前版本，Git 历史中更早的提交仍保留原文。

## 本地运行与校验

静态网页无需构建。在仓库根目录运行以下命令，然后打开终端输出的本地地址：

```sh
python3 -m http.server 8781 --bind 127.0.0.1
```

运行数据保真与事件回归检查：

```sh
node tools/check-privacy.mjs
node tools/check-events.mjs
node --check app.js
```

[check-privacy.mjs](tools/check-privacy.mjs) 还支持 `--baseline-ref <脱敏前的提交>`，在内存中对照原始数据，核对其他字段未变且确认的隐私片段不再出现在公开文本中。校验输出不包含原始隐私信息。

批注编辑器通过 `node tools/annotate.mjs` 启动，仅供本地编辑；静态页面只读取已发布批注。
