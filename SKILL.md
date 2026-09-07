---
name: astra-veda-cloudflare
description: Build, customize, troubleshoot, and deploy a Vedic astrology PDF analysis website using Gemini and Cloudflare Pages, Workers, Queues, D1, and R2. Use for Jagannatha Hora PDF workflows, seven-round report generation, queue controls, quota handling, or this bundled Astra Veda template.
---

# Astra Veda Cloudflare

Use the bundled template to create or maintain a Chinese Vedic astrology PDF analysis site. Preserve the user's branding and product choices; treat the template as a starting point rather than a fixed visual design.

## Start Here

1. Copy `assets/frontend-template/` into the user's chosen project directory.
2. Read `references/architecture.md` before changing queue, persistence, retry, or quota behavior.
3. Read `references/vedic-astrology-prompts.md` when editing interpretation structure or report prompts.
4. Replace example Cloudflare resource identifiers and project names before deployment.

## Required Invariants

- Keep `GEMINI_API_KEY` server-side as a Cloudflare secret. Never place it in HTML, client JavaScript, documentation examples with a real value, Git history, or screenshots.
- Upload PDFs to R2 only after an atomic D1 capacity reservation succeeds.
- Round 0 排盘校验：解读前必须用本地 Swiss Ephemeris 引擎（scripts/vedic_engine.py）计算关键度数（上升、行星、月亮宿、L10、AK/AmK），与 Gemini 从 PDF 读取的值交叉核对；Sandhi 边界度数（0-1°/29-30°）不一致时以本地计算为准并标注谨慎度。
- AmK 度数口径：事业指标星(AmK)按行星在所居星座内度数(0-30°)排名第二，非绝对黄经；Rahu/Ketu 不参与七行星 Karaka。
- Generate reports as Round 0 calibration + seven serial rounds: overview, career phases 1-4, love, and life guidance.
- Save each completed round immediately so partial progress survives page closure and transient failures.
- Keep global active capacity configurable and enforce it in D1, not only in the browser.
- Treat Gemini daily quota exhaustion as recoverable: preserve the PDF and completed rounds, pause intake, and resume after the Pacific-time reset.
- Treat prepaid-balance exhaustion as a site-wide intake pause until the owner switches billing mode or restores credit.
- Keep Queue consumer concurrency conservative unless the user explicitly accepts higher API cost and rate-limit pressure.
- Delete temporary PDFs after completion or terminal failure and retain report records only for the configured TTL.

## Customization

- Keep astrology language probabilistic and avoid presenting interpretations as guaranteed facts.
- Preserve accessible upload, disabled, loading, queued, paused, partial, failed, and completed states.
- Verify mobile and desktop layouts after visual changes.

## Deployment

Use Wrangler for D1 migrations, Queue Worker deployment, Pages deployment, and secrets. Never perform remote migrations, queue purges, billing changes, or production deployment without explicit user authorization. Follow the deployment checklist in `references/architecture.md`.

