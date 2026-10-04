# 社区与研究功能：本地验收记录

日期：2026-10-04。本记录是对本地既有实现的复核，以及本轮入口权限和界面更新的验证。此前记录中的浏览器测试结果不等同于本轮重新执行的结果。

## 本轮实现

- 社区支持投稿、评论、关键词和标签搜索、收藏、撤回、举报及核心审核。帖子和评论经审核后才对公众显示，个人研究不会自动转为社区投稿。
- 世界状态支持个人项目、事件时间线、固定基线、分支比较和复盘。假设规则可运行最多 12 步，并保存依据和状态变化，支持快照重放；这是通用研究框架，不是预测概率或已验证的命理模型。
- 导航始终显示受限栏目。未授权时显示锁标识并阻止点击、键盘进入和直接地址跳转；角色切换或退出后立即重新锁定。后台仍逐请求验证权限。
- 核心管理人可进入核心栏目；账户授权管理仍仅限创建者，特殊内容仍遵循现有授权范围。
- 社区沿用现有金箔绢画、星夜背景、金色描边和缓慢光影；支持减少动画设置。发布表单折叠，讨论列表和审核区分开呈现。

## 演示入口

使用公开副本的独立测试服务，地址为：

- 社区：<http://127.0.0.1:8770/__test/demo?role=public&view=community>
- 世界状态：<http://127.0.0.1:8770/__test/demo?role=reader&view=world>

顶部可以切换公开、普通账户、核心管理人和创建者。示例包含三条公开讨论、一条待审讨论、评论与收藏，以及不同账户各自独立的分支和运行结果。身份模拟仅存在于本机测试入口，不进入生产构建。

在公开副本 `site/` 中构建并启动 `node scripts/test-preview.mjs`，另开终端执行 `node tests/community-demo-seed.mjs` 可重新准备虚构示例。只有测试存储标志正确且地址为本机 8770 时，种子脚本才运行。

## 本轮实际验证

| 检查 | 结果 |
| --- | --- |
| 公开算法副本构建 | 通过 |
| 公开副本自动测试 | 109 项通过 |
| 世界状态与社区服务端集成 | 62 项通过 |
| 多步推演服务端集成 | 44 项通过 |
| 账户和命例隔离回归 | 38 项通过，仅虚构数据 |
| 服务重启后的社区/研究持久化及删除 | 5 项通过 |
| 服务重启后的运行、重放、复盘关联与级联 | 5 项通过 |
| 导航锁定、键盘/地址防绕过、升级解锁和降级重锁 | 通过实际导航模块的 DOM 测试 |
| 增量迁移、外键/唯一约束及既有记录保留 | 通过独立 SQLite 检查 |
| 公开/普通账户审核接口被拒绝、核心/创建者可访问 | 通过本机 HTTP 检查 |
| 桌面/手机视觉复核 | 本轮未完成：浏览器工具启动失败，电脑控制工具因无法可靠识别当前浏览器网址而停止；未绕过限制 |

验证服务使用公开算法适配器和独立的 `.wrangler/persistence-test`，不执行原项目私有安星模块，不读取真实技法、书籍或用户资料。未改动原有 8769 服务、正式网站、线上数据库或权限。本轮 GitHub 更新只导出明确公开清单内的源码和虚构示例。

## Community editor and review update — 2026-10-04

- Community moderation is hosted in the existing Review Center, including pending posts, replies, report target inspection, public-content lookup and hide actions. Existing technique review remains intact.
- A signed-out reader gets a sign-in entry directly inside the reply area. Signing in returns to the selected public post. Only that public post ID and a 30-minute expiry are kept as a navigation preference; drafts and private records are not put in this return marker.
- Posts and replies share plain-text / Markdown editing, bold, italic, strikethrough, headings, ordered/unordered lists, quotes, code, safe web links, and a rendered preview. HTML is displayed as text.
- Uploaded images and attachments use persistent object storage and the additive 0013 migration. Limits: 10 MiB/file, 8 files/content item, 30 MiB/content item. Access follows parent publication status. An unattached upload is private to its owner and may be removed; expired unattached uploads are cleaned on the owner's next upload.
- Validated only with fictional data and the public chart adapter on port 8770: 114 public unit / DOM tests, 50 media integration checks, 62 existing community/world checks, 38 account/case checks, additive migration preservation, and restart persistence for posts, replies and image bytes.
- Browser plugin failed to connect because its browser-service runtime file was unavailable. The automated DOM test covers comment placement, login return, rich rendering, upload controls, and moving moderation out of Community; desktop/mobile screenshot inspection was not completed this round.
- Existing Windows and Android wrappers already support file selection and authenticated file downloads; these web features load from the shared website without changing installer versions.
