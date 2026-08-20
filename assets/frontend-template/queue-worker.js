const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
const GEMINI_RETRY_MIN_MS = 10000;
const GEMINI_RETRY_MAX_MS = 20000;
const MAX_PDF_BASE64_LENGTH = 14 * 1024 * 1024;
const DAILY_PAUSE_KEY = "gemini_daily_pause_until";
const BILLING_PAUSE_KEY = "gemini_billing_paused";
const DAILY_LIMIT_MESSAGE = "今日免费分析额度已达上限，请明天再来。";
const BILLING_PAUSE_MESSAGE = "Gemini 付费余额已用完，网站正在切换免费额度；任务进度已保存，恢复后会自动继续。";
const BILLING_RETRY_SECONDS = 3600;
const MAX_QUEUE_DELAY_SECONDS = 86400;

const prompts = {
  overview: `你是一名精通印度占星（Vedic Astrology / Jyotisha）的专业占星师。请严格使用印度占星体系进行分析，不要混用西洋占星。

采用 Sidereal Zodiac、Lahiri Ayanamsa、Whole Sign Houses。重点参考 D1、D9、Vimshottari Dasha、Nakshatra、Lagna、月亮星座与月宿、行星尊贵、宫位、Drishti、Yoga、Transit。

现在是 2026 年。分析未来 1-3 年时间线时，请以 2026 年为当前年份，不要把当前时间误判为其他年份。

每一个重要结论请说明：支持因素、削弱因素、可信程度、可能触发时间。请区分长期倾向、大运/小运触发、行运短期影响。不要把占星推论描述成 100% 确定事实。

请按以下结构输出：
Step 1：确认出生资料及计算体系。
Step 2：列出核心出生盘信息：Ascendant/Lagna、Sun、Moon、Mars、Mercury、Jupiter、Venus、Saturn、Rahu、Ketu、Nakshatra、宫位、星座、重要 Yoga。
Step 3：分析 D1。
Step 4：分析 D9，重点说明婚姻、长期伴侣、人格成熟后的发展、行星强弱。
Step 5：分析 Vimshottari Dasha，列出当前 Mahadasha、Antardasha、下一阶段重要 Dasha。
Step 6：分析未来 1-3 年时间线：重要窗口、主题、触发因素、有利时期、谨慎时期。
Step 7：按事业、财务、感情、婚姻、家庭、健康、学习与个人成长总结。

请保持客观、专业、有同理心，但不讨好。`,
  love: (gender) => `# Role
现代印度占星情感分析专家（Modern Vedic Love Expert）

请基于【性别：${gender}】和星盘 PDF，进行符合现代社会背景的恋爱运势推演。请严谨区分心动机会、肉体激情与深度关系。

分析逻辑：
1. D1 恋爱模式：检查 5 宫、7 宫宫主星、宫内星及相位；关注 Rahu 是否影响 5/7 宫。女性检查金星 + 木星，男性检查金星。
2. D9 灵魂质量审计：检查 D1 5 宫主在 D9 的落点，判断关系是滋养型还是消耗型。
3. 多维时机锁定：结合 Vimsottari Dasha 与 Jaimini Chara Dasha。
4. 流年定性：区分纯恋爱、落地关系、官宣时刻。

请严格按此输出：
### 1. 我的恋爱体质报告
- 风格定义
- D9 深度评估

当前时间是 2026 年。你只能预测从现在起至 2029 年 12 月的恋爱趋势；绝不能把 2024 或 2025 年写入“未来 3 年桃花时间轴”。若盘面有更早的运势信息，只能简短作为背景依据，不得作为未来窗口展示。

### 2. 未来 3 年桃花时间轴（2026-2029）
只列出 2026 年起的 2-4 个实际未来窗口。每个窗口必须用以下格式作为独立标题，颜色标签不可省略：
### 窗口 1｜【粉色】（MM/YYYY - MM/YYYY）
- 触发机制：
- 环境支持：
- 关系性质：

颜色含义：粉色 = 纯恋爱/暧昧；紫色 = 严肃关系；金色 = 官宣/落地。请根据盘面选择最符合的标签，不要为了凑齐而机械使用三种颜色。

### 3. 现代恋爱建议
针对盘面弱点给出具体避坑建议。`,
  life: `# Role
吠陀占星灵性导师（Vedic Spiritual Mentor）

请根据 Jagannatha Hora 导出的星盘 PDF 解读人生蓝图。核心任务不是宿命论式算命，而是作为灵魂导航图，帮助识别定业与不定业，并通过心理与行为建议协助完成转化。

请用通俗、有同理心的中文输出：
## 1. 灵魂的核心课题
- 核心驱动力
- 进化方向：南北交点轴线、舒适区与进化区

## 2. 识别“定业”与惯性
不要只说某星在某宫不好，请翻译为心理模式，并说明生活中的挑战。

## 3. 转化与修行的行动指南
提供具体思维转换练习和行为微调方案。

## 4. 总结：生命的最终愿景
说明超越惯性后更高版本的自己。`,
  career1: `你是 Vedic Career Architect（吠陀职业架构师）。请基于星盘 PDF 执行职业分析 Phase 1：传统职场主干扫描。专注于数据提取和形态识别，不要进行最终职业建议合成。

扫描 10 宫、L10、10 宫居住者、与 L10 或 10 宫互容或紧密相位的星体。归类为：权威/稳态型、市场/竞争型、商贸/自由/创意型、隐形/深层/虚拟型，并检查职场受虐或失业风险补丁。

输出：
## Phase 1: 职场生态位审计报告
1. **L10 核心扫描：**
2. **定性归类：**
3. **风险警告：**

不要在输出末尾要求用户确认是否进入下一阶段；系统会自动进入下一阶段。`,
  career2: `基于 Phase 1 输出，执行 Phase 2：现代天赋/格局补丁扫描。严禁脑补，只基于已提取数据。

扫描职业/财富相关 Yoga、AmK、显性天赋星、强星状态、变现校验、凶宫修正。

输出：
## Phase 2: 天赋与变现审计报告
1. **关键格局识别（Yoga Audit）& 策略传递：**
   - **格局名称：**
   - **涉及星体：**
   - **强度评级：**
   - **>>> Phase 4 强制策略指令 <<<：**
2. **强点锁定：**
3. **变现管道校验：**
4. **凶宫修正：**

不要在输出末尾要求用户确认是否进入下一阶段；系统会自动进入下一阶段。`,
  career3: `继续保持 Vedic Career Architect 角色。基于 Phase 1 和 Phase 2 输出，执行 Phase 3：D9 深度职业内核与果实审计。严禁脑补，所有 D9 分析服务于职业命题。

回答：武器成色、职业内核、终极果实。检查 D9 10 宫、D9 Lagna、D1 L10 在 D9 的落点、AK/AmK。

输出：
## Phase 3: D9 深度职业内核与果实审计报告
### 1. 武器库压力测试
### 2. 职业内核解码（The True Content — D9 10th）
### 3. 管理风格进化（The Professional Persona — D9 Lagna）
### 4. 最终果实（The Fruit — D1 L10 in D9）
### 5. 灵魂天职校准（Karakamsha）
### 6. 阶段总结（The Bridge）

不要在输出末尾要求用户确认是否进入下一阶段；系统会自动进入下一阶段。`,
  career4: `你已完成 Phase 1、Phase 2、Phase 3。现在执行 Phase 4：全维职业合成与决策。必须严格调用前三阶段的已确证数据，不得重新发明数据。

执行：格局与质检滤镜、D1 多宫位合成、D9 职业内核叠加、D9 Persona、L8/L12 修正、动态叙事链、终极决策、现实阻力听诊。

输出：
## Phase 4: 全维职业决策书
### 1. 精密职业画像（The Granular Avatar）
### 2. 命运叙事链（The Path）
### 3. 战略决策（The Strategy）
### 4. 阻力与风险（Risk Alert）
### 5. 架构师箴言（The Closing Mantra）`,
};

const ANALYSIS_ROUNDS = [
  { module: "overview", label: "正在读取 PDF 并生成大致分析", column: "overview" },
  { module: "career", phase: 1, label: "正在生成事业 Phase 1", column: "career_1" },
  { module: "career", phase: 2, label: "正在生成事业 Phase 2", column: "career_2" },
  { module: "career", phase: 3, label: "正在生成事业 Phase 3", column: "career_3" },
  { module: "career", phase: 4, label: "正在生成事业 Phase 4", column: "career_4" },
  { module: "love", label: "正在生成爱情分析", column: "love" },
  { module: "life", label: "正在生成人生指南", column: "life" },
];

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const jobId = String(message.body?.jobId || "");
      if (!jobId) {
        message.ack();
        continue;
      }
      try {
        await processJob(jobId, env);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({
          event: "queue_job_unhandled",
          jobId,
          error: error instanceof Error ? error.message : String(error),
        }));
        message.retry({ delaySeconds: 60 });
      }
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanExpiredJobs(env));
  },
};

async function processJob(jobId, env) {
  let job = await getJob(env.DB, jobId);
  if (!job || ["completed", "failed"].includes(job.status)) return;

  const now = unixNow();
  if (await isBillingPaused(env.DB)) {
    await deferForBilling(env, job);
    return;
  }
  const pauseUntil = await getDailyPauseUntil(env.DB);
  if (pauseUntil > now) {
    await deferUntilDailyReset(env, job, pauseUntil);
    return;
  }
  await env.DB.prepare(
    "DELETE FROM service_state WHERE key = ? AND CAST(value AS INTEGER) <= ?",
  ).bind(DAILY_PAUSE_KEY, now).run();
  await env.DB.prepare(
    "UPDATE jobs SET status = 'processing', started_at = COALESCE(started_at, ?), updated_at = ?, error_code = '', error_message = '' WHERE id = ?",
  ).bind(now, now, jobId).run();

  let pdfBase64 = "";
  if (Number(job.completed_count) === 0) {
    const object = await env.PDF_BUCKET.get(job.object_key);
    if (!object) {
      await markFailed(env, job, "PDF_MISSING", "临时 PDF 已失效，请重新上传。");
      return;
    }
    pdfBase64 = arrayBufferToBase64(await object.arrayBuffer());
  }

  try {
    for (let index = Number(job.completed_count); index < ANALYSIS_ROUNDS.length; index += 1) {
      const round = ANALYSIS_ROUNDS[index];
      await env.DB.prepare(
        "UPDATE jobs SET current_task = ?, updated_at = ? WHERE id = ?",
      ).bind(round.label, unixNow(), jobId).run();

      const prompt = getRoundPrompt({
        module: round.module,
        phase: round.phase,
        gender: job.gender,
      });
      const input = index === 0
        ? [
            { type: "document", data: pdfBase64, mime_type: "application/pdf" },
            { type: "text", text: prompt },
          ]
        : prompt;

      const result = await callGeminiWithFallback(
        env.GEMINI_API_KEY,
        input,
        job.interaction_id || "",
      );

      const completedCount = index + 1;
      const completedLabel = round.label.replace("正在", "") + "已完成";
      const updateSql =
        "UPDATE jobs SET " + round.column + " = ?, completed_count = ?, current_task = ?, " +
        "interaction_id = ?, model = ?, retry_count = 0, error_code = '', error_message = '', " +
        "updated_at = ?, expires_at = ? WHERE id = ?";
      await env.DB.prepare(updateSql).bind(
        result.text,
        completedCount,
        completedLabel,
        result.interactionId,
        result.model,
        unixNow(),
        unixNow() + 86400,
        jobId,
      ).run();

      job = {
        ...job,
        completed_count: completedCount,
        interaction_id: result.interactionId,
        model: result.model,
        retry_count: 0,
      };

      if (index < ANALYSIS_ROUNDS.length - 1) {
        await sleep(3000 + Math.random() * 2000);
      }
    }

    const finishedAt = unixNow();
    await env.DB.prepare(
      "UPDATE jobs SET status = 'completed', current_task = '全部报告已生成', finished_at = ?, updated_at = ?, expires_at = ? WHERE id = ?",
    ).bind(finishedAt, finishedAt, finishedAt + 86400, jobId).run();
    await env.PDF_BUCKET.delete(job.object_key);
  } catch (error) {
    await handleAnalysisError(env, jobId, error);
  }
}

async function handleAnalysisError(env, jobId, error) {
  const job = await getJob(env.DB, jobId);
  if (!job) return;

  const retryable = error?.retryable !== false;
  const retryCount = Number(job.retry_count || 0) + 1;
  const publicMessage = error?.publicMessage || "Gemini 当前繁忙或已触发项目额度限制。";
  const code = error?.code || "GEMINI_UNAVAILABLE";

  if (code === "BILLING_CREDITS_DEPLETED") {
    await setBillingPaused(env.DB);
    await deferForBilling(env, job);
    return;
  }

  if (code === "GEMINI_DAILY_QUOTA_EXCEEDED") {
    const pauseUntil = nextPacificResetEpoch();
    await setDailyPause(env.DB, pauseUntil);
    await deferUntilDailyReset(env, job, pauseUntil);
    return;
  }

  if (retryable && retryCount <= 2) {
    const now = unixNow();
    await env.DB.prepare(
      "UPDATE jobs SET status = 'queued', retry_count = ?, current_task = 'Gemini 暂时繁忙，60 秒后自动继续', error_code = ?, error_message = ?, updated_at = ?, expires_at = ? WHERE id = ?",
    ).bind(retryCount, code, publicMessage, now, now + 86400, jobId).run();
    await env.ANALYSIS_QUEUE.send({ jobId }, { delaySeconds: 60 });
    return;
  }

  await markFailed(env, job, code, publicMessage);
}

async function markFailed(env, job, code, message) {
  const now = unixNow();
  await env.DB.prepare(
    "UPDATE jobs SET status = 'failed', current_task = '本次生成未完成', error_code = ?, error_message = ?, finished_at = ?, updated_at = ?, expires_at = ? WHERE id = ?",
  ).bind(code, message, now, now, now + 86400, job.id).run();
  await env.PDF_BUCKET.delete(job.object_key);
}

async function getJob(db, jobId) {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first();
}

async function getDailyPauseUntil(db) {
  const row = await db.prepare(
    "SELECT value FROM service_state WHERE key = ?",
  ).bind(DAILY_PAUSE_KEY).first();
  return Number(row?.value || 0);
}

async function setDailyPause(db, pauseUntil) {
  await db.prepare(
    "INSERT INTO service_state (key, value, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(DAILY_PAUSE_KEY, String(pauseUntil), unixNow()).run();
}

async function isBillingPaused(db) {
  const row = await db.prepare(
    "SELECT value FROM service_state WHERE key = ?",
  ).bind(BILLING_PAUSE_KEY).first();
  return row?.value === "1";
}

async function setBillingPaused(db) {
  await db.prepare(
    "INSERT INTO service_state (key, value, updated_at) VALUES (?, '1', ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(BILLING_PAUSE_KEY, unixNow()).run();
}

async function deferForBilling(env, job) {
  const now = unixNow();
  await env.DB.prepare(
    "UPDATE jobs SET status = 'queued', current_task = ?, error_code = 'BILLING_CREDITS_DEPLETED', " +
    "error_message = ?, updated_at = ?, expires_at = ? WHERE id = ?",
  ).bind(
    BILLING_PAUSE_MESSAGE,
    BILLING_PAUSE_MESSAGE,
    now,
    Math.max(Number(job.expires_at || 0), now + 172800),
    job.id,
  ).run();
  await env.ANALYSIS_QUEUE.send({ jobId: job.id }, { delaySeconds: BILLING_RETRY_SECONDS });
}

async function deferUntilDailyReset(env, job, pauseUntil) {
  const now = unixNow();
  const delaySeconds = Math.min(
    MAX_QUEUE_DELAY_SECONDS,
    Math.max(60, pauseUntil - now),
  );
  await env.DB.prepare(
    "UPDATE jobs SET status = 'queued', current_task = ?, error_code = 'GEMINI_DAILY_QUOTA_EXCEEDED', " +
    "error_message = ?, updated_at = ?, expires_at = ? WHERE id = ?",
  ).bind(
    DAILY_LIMIT_MESSAGE,
    DAILY_LIMIT_MESSAGE,
    now,
    Math.max(Number(job.expires_at || 0), pauseUntil + 86400),
    job.id,
  ).run();
  await env.ANALYSIS_QUEUE.send({ jobId: job.id }, { delaySeconds });
}

async function cleanExpiredJobs(env) {
  const now = unixNow();
  const expired = await env.DB.prepare(
    "SELECT id, object_key FROM jobs WHERE expires_at < ? LIMIT 100",
  ).bind(now).all();

  for (const job of expired.results || []) {
    await env.PDF_BUCKET.delete(job.object_key);
  }

  if ((expired.results || []).length) {
    const statements = expired.results.map((job) =>
      env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(job.id),
    );
    await env.DB.batch(statements);
  }
}

async function callGeminiWithFallback(apiKey, input, previousInteractionId) {
  let lastStatus = 503;

  for (let index = 0; index < GEMINI_MODELS.length; index += 1) {
    const model = GEMINI_MODELS[index];
    const response = await callGemini(apiKey, model, input, previousInteractionId);
    const responseText = await response.text();

    if (response.ok) {
      const data = JSON.parse(responseText);
      const text = extractOutputText(data);
      if (!data.id || !text) {
        throw new ServiceError(
          "Gemini 返回的本轮内容不完整，系统稍后会自动继续。",
          503,
          "INCOMPLETE_INTERACTION",
          true,
        );
      }
      return {
        text,
        interactionId: data.id,
        model: data.model || model,
        usage: data.usage || null,
      };
    }

    lastStatus = response.status;
    const upstreamError = parseGeminiError(responseText);

    if (response.status === 429 && isDailyQuotaError(responseText)) {
      throw new ServiceError(
        DAILY_LIMIT_MESSAGE,
        429,
        "GEMINI_DAILY_QUOTA_EXCEEDED",
        false,
      );
    }

    if (response.status === 429 && /prepayment credits are depleted/i.test(upstreamError)) {
      throw new ServiceError(
        "Gemini 项目的预付余额已经耗尽，请先确认充值是否到账。",
        429,
        "BILLING_CREDITS_DEPLETED",
        false,
      );
    }

    const retryable = [429, 500, 502, 503, 504, 524].includes(response.status);
    if (!retryable) {
      throw new ServiceError(
        response.status === 400
          ? "Gemini 无法读取这份 PDF，请确认它是有效的 Jagannatha Hora PDF。"
          : "Gemini 暂时无法处理这份报告。",
        response.status,
        "GEMINI_" + response.status,
        false,
      );
    }

    if (index < GEMINI_MODELS.length - 1) {
      await sleep(randomRetryDelay(index));
    }
  }

  throw new ServiceError(
    lastStatus === 429
      ? "Gemini 请求频率较高，系统会稍后自动继续。"
      : "Gemini 服务当前繁忙，系统会稍后自动继续。",
    lastStatus,
    lastStatus === 429 ? "GEMINI_RATE_LIMITED" : "GEMINI_BUSY",
    true,
  );
}

function callGemini(apiKey, model, input, previousInteractionId) {
  const payload = {
    model,
    input,
    store: true,
    generation_config: { temperature: 0.45 },
  };
  if (previousInteractionId) payload.previous_interaction_id = previousInteractionId;

  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
}

function extractOutputText(data) {
  return (data.steps || [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === "text" && content.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function parseGeminiError(responseText) {
  try {
    const payload = JSON.parse(responseText);
    return String(payload?.error?.message || payload?.error?.status || "Unknown Gemini error").slice(0, 1200);
  } catch {
    return String(responseText || "Unknown Gemini error").slice(0, 1200);
  }
}

function isDailyQuotaError(responseText) {
  const normalized = String(responseText || "").toLowerCase();
  return normalized.includes("quota_exceeded") ||
    normalized.includes("daily quota") ||
    normalized.includes("requests per day") ||
    normalized.includes("tokens per day") ||
    normalized.includes("per_day") ||
    normalized.includes("perday");
}

function nextPacificResetEpoch() {
  const now = Date.now();
  const currentDate = pacificDateKey(now);
  let low = now;
  let high = now + 27 * 60 * 60 * 1000;

  for (let candidate = now + 15 * 60 * 1000; candidate <= high; candidate += 15 * 60 * 1000) {
    if (pacificDateKey(candidate) !== currentDate) {
      high = candidate;
      low = candidate - 15 * 60 * 1000;
      break;
    }
  }

  while (high - low > 1000) {
    const middle = low + Math.floor((high - low) / 2);
    if (pacificDateKey(middle) === currentDate) low = middle;
    else high = middle;
  }

  return Math.ceil(high / 1000) + 60;
}

function pacificDateKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

class ServiceError extends Error {
  constructor(publicMessage, status, code, retryable = true) {
    super(code);
    this.publicMessage = publicMessage;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function getRoundPrompt(body) {
  const common = "请直接输出可展示的中文 Markdown，不要输出 JSON，不要询问用户是否继续，也不要省略规定的小节。每个重要判断都要尽量给出具体盘面依据，避免空泛套话。";
  if (body.module === "overview") {
    return "这是 7 轮连续分析的第 1 轮。请先完整读取随附 PDF，建立后续轮次共用的星盘事实上下文，然后完成大致分析。总览建议 2500-4000 个中文字符。\n\n" + prompts.overview + "\n\n" + common;
  }
  if (body.module === "career") {
    const phase = Number(body.phase);
    return "这是同一段会话的第 " + (phase + 1) + " 轮。请沿用首轮 PDF 和之前轮次已确认的数据，完成事业 Phase " + phase + "；不得重新发明盘面数据。建议 1200-2200 个中文字符。\n\n" + prompts["career" + phase] + "\n\n" + common;
  }
  if (body.module === "love") {
    return "这是同一段会话的第 6 轮。请沿用首轮 PDF 与前序轮次上下文，完成爱情分析。建议 2000-3200 个中文字符。\n\n" + prompts.love(body.gender || "未提供") + "\n\n" + common;
  }
  if (body.module === "life") {
    return "这是同一段会话的第 7 轮。请沿用首轮 PDF 与前序轮次上下文，完成人生指南。建议 1800-2800 个中文字符。\n\n" + prompts.life + "\n\n" + common;
  }
  throw new ServiceError("未知分析轮次。", 400, "UNKNOWN_ROUND", false);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomRetryDelay(attempt) {
  const base = GEMINI_RETRY_MIN_MS * 2 ** attempt;
  return Math.min(GEMINI_RETRY_MAX_MS, base + Math.random() * GEMINI_RETRY_MIN_MS);
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}