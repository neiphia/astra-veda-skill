# Astra Veda Cloudflare Skill

一个可安装的 Codex Skill，用于搭建、修改和部署“印度占星 PDF + Gemini 分析”网站。仓库内附带完整的 Cloudflare Pages / Workers / Queues / D1 / R2 前后端模板。

## 能做什么

- 上传 Jagannatha Hora 导出的印度占星 PDF
- Round 0 排盘校验与历史回测：本地 Swiss Ephemeris 引擎计算关键度数，与 Gemini 从 PDF 读取的值交叉核对；用户提供 3-5 个历史事件回测大运/小运/行运，校准解读口径偏好
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

## 本地排盘校验（Round 0）

在正式解读前，可用本地 Swiss Ephemeris 引擎（`scripts/vedic_engine.py`）进行排盘校验与历史回测：

```bash
# 安装依赖
pip install pyswisseph

# 用虚构示例数据跑全量排盘
python3 scripts/vedic_engine.py --example

# 指定出生资料
python3 scripts/vedic_engine.py --year 1995 --month 10 --day 17 \
  --hour 13 --tz 8 --lat 23.1 --lon 113.46

# 带历史事件回测校准
python3 scripts/vedic_engine.py --year 1995 --month 10 --day 17 \
  --hour 13 --tz 8 --lat 23.1 --lon 113.46 \
  --round0 events.json
```

`events.json` 格式：
```json
[
  {"year": 2010, "desc": "大学毕业"},
  {"year": 2015, "desc": "第一份工作"},
  {"year": 2020, "desc": "职业转型"},
  {"year": 2023, "desc": "搬家/出国"},
  {"year": 2025, "desc": "重要人际关系变化"}
]
```

输出 JSON 包含 D1 全行星数据、D9 九分盘、Vimshottari 大运序列、Jaimini Karaka（AK~DK）、Arudha（AL/UL/A7/A10）、逐年行运（土星/木星/Rahu/Ketu）、土星回归、木星回归，以及 round0 校准报告（MD/AD 匹配、行运宫位、可信度评级）。

**回测校准能力：** 用户用历史事件反推校准解读口径，避免 AI 对双主星事件形式做过拟合预测。尤其在 L5=L10（同一星同时守护恋爱宫与事业宫）等双主星场景下，回测能确认该星能量实际更常以哪个宫位主题显化，从而修正后续解读的置信度与事件形式判断。

## 部署补充

部署前请确认以下 checklist（未经用户明确授权不得执行真实部署）：

1. `wrangler login` — 确保已登录 Cloudflare 账号
2. 创建 D1 数据库、R2 存储桶、Queue 队列，并将 ID 填入 wrangler 配置
3. `npx wrangler secret put GEMINI_API_KEY` — 将 Gemini API Key 设为 Cloudflare Secret
4. `npx wrangler d1 migrations apply astra-veda-jobs --remote` — 执行数据库迁移
5. `npx wrangler deploy --config wrangler.queue.toml` — 部署 Queue Worker
6. `npx wrangler pages deploy dist --project-name <project> --branch production` — 部署 Pages 前端
7. 验证 `/api/capacity`、上传限流、Queue 消费、D1 活跃计数

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

