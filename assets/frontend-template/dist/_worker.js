const MAX_PDF_BASE64_LENGTH = 14 * 1024 * 1024;
const JOB_TTL_SECONDS = 86400;
const MAX_ACTIVE_JOBS = 5;
const DAILY_PAUSE_KEY = "gemini_daily_pause_until";
const BILLING_PAUSE_KEY = "gemini_billing_paused";
const QUEUE_FULL_MESSAGE = "前面已有 5 份报告正在排队或生成，请稍后再来。";
const DAILY_LIMIT_MESSAGE = "今日免费分析额度已达上限，请明天再来。";
const BILLING_PAUSE_MESSAGE = "Gemini 付费余额已用完，网站正在切换免费额度，暂时停止接收新报告。";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return apiResponse(null, 204);
      }

      try {
        if (url.pathname === "/api/health" && request.method === "GET") {
          assertBindings(env);
          await env.DB.prepare("SELECT 1 AS ok").first();
          const capacity = await getCapacity(env.DB);
          return apiResponse({
            ok: true,
            queueMode: "global-single-concurrency",
            ...capacity,
          });
        }
        if (url.pathname === "/api/capacity" && request.method === "GET") {
          assertBindings(env);
          return apiResponse(await getCapacity(env.DB));
        }
        if (url.pathname === "/api/jobs" && request.method === "POST") {
          return await createJob(request, env);
        }

        const jobMatch = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
        if (jobMatch && request.method === "GET") {
          return await readJob(jobMatch[1], env);
        }

        if (url.pathname === "/api/analyze") {
          return apiResponse(
            { error: "分析系统已经升级为后台排队模式，请刷新页面后重新开始。", code: "CLIENT_UPDATE_REQUIRED" },
            409,
          );
        }

        return apiResponse({ error: "接口不存在。", code: "NOT_FOUND" }, 404);
      } catch (error) {
        console.error(JSON.stringify({
          event: "pages_api_failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }));
        return apiResponse(
          {
            error: error?.publicMessage || "任务服务暂时不可用，请稍后再试。",
            code: error?.code || "JOB_SERVICE_UNAVAILABLE",
          },
          Number(error?.status) || 503,
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function createJob(request, env) {
  assertBindings(env);
  await assertIntakeAvailable(env.DB);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16 * 1024 * 1024) {
    throw new ApiError("请求体过大，请上传 10MB 以内的 PDF。", 413, "PAYLOAD_TOO_LARGE");
  }

  const body = await request.json();
  if (!body.pdfBase64 || body.pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
    throw new ApiError("PDF 缺失或超过 10MB 限制。", 400, "INVALID_PDF");
  }
  if (!["男", "女"].includes(body.gender)) {
    throw new ApiError("请选择性别。", 400, "INVALID_GENDER");
  }

  const pdfBytes = base64ToBytes(body.pdfBase64);
  if (!looksLikePdf(pdfBytes)) {
    throw new ApiError("文件不是有效的 PDF，请重新导出后上传。", 400, "INVALID_PDF");
  }

  const jobId = crypto.randomUUID();
  const objectKey = "jobs/" + jobId + ".pdf";
  const now = unixNow();
  const fileName = sanitizeFileName(body.fileName || "chart.pdf");

  try {
    const reservation = await env.DB.prepare(
      "INSERT INTO jobs (id, status, gender, file_name, object_key, created_at, updated_at, expires_at, current_task) " +
      "SELECT ?, 'queued', ?, ?, ?, ?, ?, ?, '等待进入分析队列' " +
      "WHERE NOT EXISTS (SELECT 1 FROM service_state WHERE key = ? AND CAST(value AS INTEGER) > ?) " +
      "AND NOT EXISTS (SELECT 1 FROM service_state WHERE key = ? AND value = '1') " +
      "AND (SELECT COUNT(*) FROM jobs WHERE status IN ('queued', 'processing')) < ?",
    ).bind(
      jobId,
      body.gender,
      fileName,
      objectKey,
      now,
      now,
      now + JOB_TTL_SECONDS,
      DAILY_PAUSE_KEY,
      now,
      BILLING_PAUSE_KEY,
      MAX_ACTIVE_JOBS,
    ).run();

    if (Number(reservation.meta?.changes || 0) !== 1) {
      await assertIntakeAvailable(env.DB);
      throw new ApiError(QUEUE_FULL_MESSAGE, 429, "QUEUE_FULL");
    }

    await env.PDF_BUCKET.put(objectKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { fileName },
    });
    await env.ANALYSIS_QUEUE.send({ jobId });
  } catch (error) {
    await env.PDF_BUCKET.delete(objectKey).catch(() => {});
    await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(jobId).run().catch(() => {});
    throw error;
  }

  const position = await getQueuePosition(env.DB, jobId, now);
  return apiResponse({
    jobId,
    status: "queued",
    queuePosition: position,
    completedJobs: 0,
    totalJobs: 7,
    currentTask: "等待进入分析队列",
  }, 202);
}

async function assertIntakeAvailable(db) {
  const capacity = await getCapacity(db);
  if (capacity.billingPaused) {
    throw new ApiError(BILLING_PAUSE_MESSAGE, 429, "BILLING_PAUSED");
  }
  if (capacity.dailyLimitReached) {
    throw new ApiError(DAILY_LIMIT_MESSAGE, 429, "DAILY_LIMIT_REACHED");
  }
  if (!capacity.accepting) {
    throw new ApiError(QUEUE_FULL_MESSAGE, 429, "QUEUE_FULL");
  }
}

async function getCapacity(db) {
  const now = unixNow();
  const [activeResult, dailyPauseResult, billingPauseResult] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('queued', 'processing')"),
    db.prepare("SELECT value FROM service_state WHERE key = ?").bind(DAILY_PAUSE_KEY),
    db.prepare("SELECT value FROM service_state WHERE key = ?").bind(BILLING_PAUSE_KEY),
  ]);
  const activeJobs = Number(activeResult.results?.[0]?.count || 0);
  const pauseUntil = Number(dailyPauseResult.results?.[0]?.value || 0);
  const dailyLimitReached = pauseUntil > now;
  const billingPaused = billingPauseResult.results?.[0]?.value === "1";
  const accepting = !billingPaused && !dailyLimitReached && activeJobs < MAX_ACTIVE_JOBS;
  const message = billingPaused
    ? BILLING_PAUSE_MESSAGE
    : dailyLimitReached
      ? DAILY_LIMIT_MESSAGE
      : activeJobs >= MAX_ACTIVE_JOBS
        ? QUEUE_FULL_MESSAGE
        : "当前排队名额 " + activeJobs + "/" + MAX_ACTIVE_JOBS + "，可以上传报告。";

  return {
    accepting,
    activeJobs,
    maxActiveJobs: MAX_ACTIVE_JOBS,
    billingPaused,
    dailyLimitReached,
    resumeAt: dailyLimitReached ? pauseUntil : 0,
    message,
  };
}async function readJob(jobId, env) {
  assertBindings(env);
  const job = await env.DB.prepare(
    "SELECT * FROM jobs WHERE id = ?",
  ).bind(jobId).first();

  if (!job) {
    return apiResponse(
      { error: "任务不存在或结果已经过期。", code: "JOB_NOT_FOUND" },
      404,
    );
  }

  const queuePosition = job.status === "queued"
    ? await getQueuePosition(env.DB, job.id, Number(job.created_at))
    : 0;

  return apiResponse({
    jobId: job.id,
    status: job.status,
    queuePosition,
    completedJobs: Number(job.completed_count || 0),
    totalJobs: 7,
    currentTask: job.current_task,
    model: job.model,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    createdAt: Number(job.created_at),
    updatedAt: Number(job.updated_at),
    results: {
      overview: job.overview || "",
      career: [
        job.career_1 || "",
        job.career_2 || "",
        job.career_3 || "",
        job.career_4 || "",
      ],
      love: job.love || "",
      life: job.life || "",
    },
  });
}

async function getQueuePosition(db, jobId, createdAt) {
  const result = await db.prepare(
    "SELECT COUNT(*) AS position FROM jobs WHERE status = 'queued' AND (created_at < ? OR (created_at = ? AND id <= ?))",
  ).bind(createdAt, createdAt, jobId).first();
  return Math.max(1, Number(result?.position || 1));
}

function assertBindings(env) {
  if (!env.DB || !env.PDF_BUCKET || !env.ANALYSIS_QUEUE) {
    throw new ApiError("后台排队资源尚未连接。", 503, "MISSING_BINDINGS");
  }
}

function base64ToBytes(value) {
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new ApiError("PDF 编码无效，请重新选择文件。", 400, "INVALID_PDF");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function looksLikePdf(bytes) {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 160) || "chart.pdf";
}

function apiResponse(payload, status = 200) {
  const response = payload === null
    ? new Response(null, { status })
    : Response.json(payload, { status });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

class ApiError extends Error {
  constructor(publicMessage, status, code) {
    super(code);
    this.publicMessage = publicMessage;
    this.status = status;
    this.code = code;
  }
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}
