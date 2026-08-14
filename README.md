# 雅思学习助手

一个无需后端、可双击打开的单页面雅思学习工具。目前完整实现单词模块，支持：

- 联网查询英文单词并生成单词卡
- 手动编辑中文释义、英文定义、近义词和例句
- 保存个人单词卡到浏览器 `localStorage`
- 单词库搜索、排序、星级标记和星级筛选
- 手动选择一个或多个本地 JSON 词典
- 联网查询失败后按需扫描已选择的本地词典

## 运行

直接双击 `index.html`，或用浏览器打开该文件即可。

## 使用本地词典

1. 进入“单词”模块。
2. 在查询框中选择本地 JSON 词典文件。
3. 输入英文单词并点击“生成单词卡”。
4. 查询时按需读取已选择的词典，不会修改原始 JSON 文件。

`dict` 目录仅作为本地词典存放位置。由于词典文件体积很大，仓库通过 `.gitignore` 排除了 `dict/*.json`，这些文件不会被提交到 Gitee。克隆项目后，请将自己的 JSON 词典保留在本地并在页面中手动选择。

支持的标准字段：

```json
{
  "word": "resilient",
  "phonetic": "/rɪˈzɪliənt/",
  "cn_meaning": "有韧性的；能复原的",
  "en_definition": "able to recover quickly from difficulty",
  "examples": ["She is resilient in difficult situations."],
  "synonyms": ["strong", "tough", "flexible"]
}
```

## 项目结构

```text
.
├── index.html
├── README.md
├── .gitignore
└── dict/
    └── 本地 JSON 词典（不纳入 Git）
```

## 数据说明

- 个人单词库和星级只保存在当前浏览器的 `localStorage`。
- 本地原始词典只读，不会被页面修改。
- 项目不包含 Flask、数据库或其他后端服务。
