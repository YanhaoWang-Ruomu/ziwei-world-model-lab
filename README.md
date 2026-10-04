# 观星台 · Ziwei World Model Lab

紫微命盘、天文星空与研究资料管理的应用框架，包含网站、Windows 桌面端和 Android 客户端。

[访问网站](https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site/) · [下载安装包](https://ziwei-world-model-lab.vocal-chime-3672.chatgpt.site/download)

## 公开范围

这个仓库保存可公开的应用源码及视觉素材。网站界面包括十二宫方盘、命运轮盘、运限切换、星空与山河动画；服务框架包括账户、命例、书库 OCR 与简繁搜索、技法卡编写、审核及历史记录，也包括社区讨论、评论、标签搜索、收藏、举报和审核，以及个人世界状态、事件、分支对比与复盘。本仓库使用 iztro 公开排盘算法。

**不包含**站点所有者的私有安星方法、真实技法及推导材料、原始书籍和 PDF、用户账户和命例、数据库内容、上传文件、服务器凭据或 Android 签名密钥。数据表迁移只有结构，首次运行书库与技法库为空。规则匹配结果不是事件发生概率，应用也不代表已验证的预测或世界模型。

公开 Git 历史从审查后的应用快照开始，不导入原项目历史。第三方代码与素材各自的许可证和来源说明随文件保留；仓库公开本身不表示另行授予未声明的许可证。

## 本地运行网站

需要 Node.js 22 或更新版本、pnpm。默认地址是 `http://127.0.0.1:8879`，避免占用原项目的预览端口。

```sh
cd site
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run preview
```

第一次启动会在本副本的 `site/.local-data/live` 建立独立的本地数据。开发预览中的登录入口模拟虚构管理员，仅限本机；不能把 `server/dev-worker.js` 部署到公网。正式部署须使用 `server/worker.js`，配置自己的 D1、R2 与可信身份服务，并保护身份代理头。`wrangler.jsonc` 是本地示例，不含线上数据库标识或凭据。

排盘默认在浏览器内使用公开算法。服务端同样使用公开算法适配器 `server/chart-public.mjs`，用于演示完整请求与运限切换。此实现不等同于正式站点的私有安星方法。

## 社区与研究演示

受限栏目对访客显示锁标识，授权后才能进入；后台会独立核验权限。帖子和评论需审核后公开。个人研究按账户隔离，支持最多 12 步的假设规则模拟、保存及快照重放，不会自动公开为社区内容。

在 `site/` 中完成构建后，启动独立虚构测试服务：

```sh
node scripts/test-preview.mjs
# 另开终端，在同一 site 目录准备示例
node tests/community-demo-seed.mjs
```

打开 <http://127.0.0.1:8770/__test/demo?role=public&view=community>，可切换演示角色和社区/世界状态页面。测试服务使用单独的本地测试存储，不能部署到公网。详细功能与当前验证范围见 [本地验收记录](site/docs/community-local-acceptance.md)。

## Windows 与 Android

- `desktop/`：Electron 桌面端源码、图标与构建脚本；`cd desktop && pnpm install --frozen-lockfile && pnpm dist`。详见其 README。
- `android/`：原生 WebView 客户端源码与构建脚本。使用 JDK 17 / Android SDK 35，详见其 README。
- 两种客户端连接在线服务。仓库不放安装包、依赖缓存、个人数据或发布签名。Android 自行构建会使用自己的密钥，不能替换官方签名安装包。

## 后续同步到 GitHub

维护者在原工作区完成修改、检查并提交网站源码后，使用公开清单导出。新增文件须先加入 `maintenance/public-files.json` 并确认没有私人资料。脚本只读取清单内文件，不复制原 Git 历史，也不会将原工作区的未提交网站改动带进来；桌面与安卓采用清单内的当前源文件。

```sh
node maintenance/sync.mjs --source-root <原工作区> --ref HEAD
# 在本公开副本中检查差异、运行构建和测试
git diff --stat
node maintenance/sync.mjs --source-root <原工作区> --ref HEAD --reviewed --push
```

最后一步执行普通提交和 `git push -u origin main`，并核对远端提交。不会强制推送。若 GitHub 有其他人的更新，先在公开副本拉取并处理，再重试。脚本遇到未知文件、路径越界、缺失文件、凭据特征或适配点变化会停止。

GitHub 同步与线上网站发布分别执行；GitHub 推送本身不会更改正式网站或上传用户资料。`.gitignore` 是辅助规则，不能作为保密隔离措施。
