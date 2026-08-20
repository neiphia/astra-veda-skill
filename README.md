# Astra Veda Cloudflare Skill

一个可安装的 Codex Skill，用于搭建、修改和部署“印度占星 PDF + Gemini 分析”网站。仓库内附带完整的 Cloudflare Pages / Workers / Queues / D1 / R2 前后端模板。

## 能做什么

- 上传 Jagannatha Hora 导出的印度占星 PDF
- 使用 Gemini 串行生成 7 轮报告
- 大致分析、事业 Phase 1-4、爱情分析与人生指南
- Cloudflare 全站队列与最多 5 份活跃任务限制
- 保存每一轮结果，关闭网页后仍可继续
- Gemini 每日额度或付费余额耗尽时暂停上传
- Cloudflare Pages 静态前端、D1 状态、R2 临时 PDF 与 Queue Worker

## 安装 Skill

将本仓库克隆到 Codex Skill 目录：

```powershell
git clone https://github.com/pageyy1029-cmd/astra-veda-skill.git D:\CodexHome\skills\astra-veda-cloudflare
```

重新启动 Codex 后，可以直接描述需求，或显式使用：

```text
$astra-veda-cloudflare 帮我基于模板搭建一个印度占星 PDF 分析网站
```

## 模板位置

完整网站模板位于：

```text
assets/frontend-template/
```

提示词参考位于：

```text
references/vedic-astrology-prompts.md
```

## 部署前准备

1. 安装 Node.js 20+ 并运行 `npm install`。
2. 创建 Cloudflare D1、R2 和 Queue 资源。
3. 将两个 Wrangler 配置中的数据库 ID 占位符替换为自己的 D1 ID。
4. 设置 Gemini Key，只允许写入 Cloudflare Secret：

```powershell
npx wrangler secret put GEMINI_API_KEY --config wrangler.queue.toml
```

5. 执行远端迁移并部署：

```powershell
npx wrangler d1 migrations apply astra-veda-jobs --remote --config wrangler.toml
npx wrangler deploy --config wrangler.queue.toml
npx wrangler pages deploy dist --project-name astra-veda-star --branch production
```

## 个性化与隐私

模板保留了示例站点的主要视觉资源。公开部署前，请检查并替换：

- Cloudflare 项目、数据库、R2 和 Queue 名称
- Gemini 模型、额度与重试策略
- 品牌名称、免责声明与服务文案

不要把 `key.txt`、`.dev.vars`、`.env`、真实 API Key、PDF、`.wrangler/` 或 `node_modules/` 提交到 GitHub。

## 架构说明

详细的数据流、队列逻辑、额度暂停与恢复方式见 [references/architecture.md](references/architecture.md)。

## 重要说明

占星内容仅用于个人探索与娱乐，不应替代医疗、法律、财务或心理健康等专业建议。模型输出可能出错，请保留人工判断。

