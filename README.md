# 雅思学习助手

一个无需后端的单页雅思学习工具，包含单词、写作和口语学习模块。所有个人数据保存在浏览器本地，适合部署为静态网站，也支持 PWA 安装到手机主屏幕。

## 功能

- 联网查询英文单词并生成单词卡
- 编辑中文释义、英文定义、近义词和例句
- 单词库搜索、排序、星级标记和筛选
- 写作素材、批改记录和高亮标注
- 口语结构卡、同义替换卡和高亮标注
- 手动选择本地 JSON 词典，联网失败时按需查询
- 使用 `localStorage` 保存学习数据
- 可选 Supabase 云端同步，多设备共用同一份学习数据
- 使用 service worker 缓存页面壳，支持离线打开
- 支持安装为手机 PWA，独立窗口运行

## 本地运行

直接双击 `index.html` 可以使用主要功能，但浏览器通常不会在 `file://` 协议下注册 service worker。

要完整测试 PWA，请在项目目录启动静态服务器：

```bash
python -m http.server 8080
```

然后打开 `http://localhost:8080`。

## 项目结构

```text
.
├── index.html
├── manifest.json
├── sw.js
├── vercel.json
├── supabase-schema.sql
├── README.md
├── .gitignore
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── dict/
    └── 本地 JSON 词典（不纳入 Git）
```

## 数据和隐私

- 个人单词、写作、口语和设置数据只保存在当前浏览器的 `localStorage`。
- 配置 Supabase 后，登录同一账号即可把个人数据同步到云端。
- 项目没有 Flask 或 Node 后端；Supabase 云端数据库和账号登录为可选配置。
- 本地原始词典只读，不会被页面修改。
- 清除浏览器站点数据会删除本机学习记录；如需备份，请使用浏览器开发者工具导出对应的 localStorage 数据。

## Supabase 云端同步

1. 在 Supabase 项目的 SQL Editor 执行 `supabase-schema.sql`。
2. 打开 Project Settings -> API，复制 Project URL 和 Publishable / anon key。
3. 在 `index.html` 中设置：

```js
const SUPABASE_URL = "你的 Project URL";
const SUPABASE_PUBLISHABLE_KEY = "你的 Publishable / anon key";
```

4. 部署到固定网址后，点击页面右上角“云同步”登录或注册。

页面只使用公开的 publishable / anon key。不要把 `service_role` 或 Secret Key 放进前端代码。

## 使用本地词典

1. 进入“单词”模块。
2. 在查询框中选择一个或多个本地 JSON 词典文件。
3. 输入英文单词并点击“生成单词卡”。
4. 查询时按需读取已选择的词典，不会修改原始 JSON 文件。

由于词典文件可能很大，`.gitignore` 排除了 `dict/*.json`，这些文件不会被提交到 GitHub 或 Gitee。克隆项目后，请将自己的 JSON 词典放在 `dict/` 中，再在页面里手动选择。

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

## 推送到 GitHub

### 第一次推送

1. 在 GitHub 新建一个空仓库，例如 `English`。
2. 不要勾选自动创建 README、`.gitignore` 或 License，避免和本地历史冲突。
3. 在项目目录执行：

```bash
git remote add origin https://github.com/你的用户名/English.git
git branch -M main
git add .
git commit -m "feat: add PWA support"
git push -u origin main
```

如果仓库已经有 `origin`，先查看：

```bash
git remote -v
```

需要改地址时执行：

```bash
git remote set-url origin https://github.com/你的用户名/English.git
```

GitHub 登录时，HTTPS 密码应使用 Personal Access Token，而不是 GitHub 登录密码。也可以使用 GitHub Desktop 完成登录和推送。

## 连接 Vercel 自动部署

1. 打开 [Vercel](https://vercel.com/) 并使用 GitHub 登录。
2. 点击 **Add New...**，选择 **Project**。
3. 导入你的 `English` GitHub 仓库。
4. Framework Preset 选择 **Other** 或保持自动识别。
5. Build Command 留空，Output Directory 留空，Install Command 留空。
6. 点击 **Deploy**。
7. 部署完成后，Vercel 会给出一个 `vercel.app` 地址。

之后每次执行：

```bash
git add .
git commit -m "feat: update study tool"
git push
```

Vercel 都会自动为 GitHub 的 `main` 分支创建部署。Pull Request 通常还会自动生成 Preview Deployment。

项目里的 `vercel.json` 已经为 service worker、manifest 和图标配置了合适的缓存头，不需要额外的后端配置。

## 手机安装 PWA

### Android Chrome

1. 用 Chrome 打开 Vercel 地址。
2. 等页面加载完成，并确保使用 HTTPS。
3. 点击右上角菜单。
4. 选择“安装应用”或“添加到主屏幕”。
5. 确认安装。

### iPhone Safari

1. 用 Safari 打开 Vercel 地址。
2. 点击底部“分享”按钮。
3. 选择“添加到主屏幕”。
4. 确认名称并点击“添加”。

打开主屏幕图标后，页面会以 `standalone` 模式运行，不显示普通浏览器地址栏，视觉上接近原生 App。iPhone 需要使用 Safari 完成安装，微信或普通 App 内置浏览器通常不能正确安装 PWA。

## 更新后看不到新版本

service worker 会缓存页面壳。部署新版本后，如果手机仍显示旧内容：

1. 关闭已经打开的 PWA 窗口。
2. 在浏览器中打开网站，刷新一次。
3. Android Chrome 可进入网站设置并清除站点数据后重新添加。
4. iPhone 可删除主屏幕图标，再用 Safari 重新添加。
