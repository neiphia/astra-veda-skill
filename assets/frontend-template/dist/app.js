const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const PRODUCTION_WORKER_ENDPOINT = "/api/jobs";
const QUEUE_CAPACITY_MESSAGE = "前面已有 5 份报告正在排队或生成，请稍后再来。";
const DAILY_LIMIT_MESSAGE = "今日免费分析额度已达上限，请明天再来。";
let progressTimer = null;
let capacityRefreshTimer = null;

const state = {
  pdfFile: null,
  pdfBase64: "",
  gender: "",
  results: {
    overview: "",
    career: ["", "", "", ""],
    love: "",
    life: "",
  },
  loading: {
    overview: false,
    career: false,
    love: false,
    life: false,
  },
  workerEndpoint: isLocalPreview ? localStorage.getItem("astraWorkerEndpoint") || "" : PRODUCTION_WORKER_ENDPOINT,
  analysisStarted: false,
  analysisFailed: false,
  totalJobs: 7,
  completedJobs: 0,
  currentTask: "等待启动",
  startedAt: 0,
  jobId: "",
  jobStatus: "idle",
  queuePosition: 0,
  lastError: "",
  errorCode: "",
  overviewExpanded: false,
  capacity: {
    checking: !isLocalPreview,
    accepting: isLocalPreview,
    activeJobs: 0,
    maxActiveJobs: 5,
    billingPaused: false,
    dailyLimitReached: false,
    resumeAt: 0,
    message: isLocalPreview ? "本地预览模式，可以测试上传界面。" : "正在查询当前排队名额…",
  },
};

const app = document.querySelector("#app");
const homeTemplate = document.querySelector("#homeTemplate");
const backButton = document.querySelector("#backButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const workerEndpointInput = document.querySelector("#workerEndpoint");

const moduleCards = [
  {
    href: "#/result/career",
    key: "career",
    eyebrow: "CAREER / 4 PHASES",
    title: "事业架构",
    text: "我天生该靠什么吃饭？我的职业终局通向财富、名望，还是智慧？",
  },
  {
    href: "#/result/love",
    key: "love",
    eyebrow: "LOVE / TIMELINE",
    title: "爱情推演",
    text: "我的正缘何时出现？这段关系会滋养我，还是消耗我？",
  },
  {
    href: "#/result/life",
    key: "life",
    eyebrow: "SOUL / KARMA",
    title: "人生指南",
    text: "我的灵魂此生想体验什么？哪些惯性在反复困住我，又该如何破局？",
  },
];

const careerPhases = [
  ["Phase 1：职场生态位", "你在社会结构中的真实位置"],
  ["Phase 2：天赋与变现", "你的核心武器，以及它能不能赚钱"],
  ["Phase 3：D9 深度内核", "剥开外衣，你每天真正在做的事"],
  ["Phase 4：全维决策", "最终职业蓝图与战略路径"],
];

const sampleResults = {
  overview: `## Step 1：计算体系确认
本次解读使用 Sidereal Zodiac、Lahiri Ayanamsa 与 Whole Sign Houses。请把它视为一张倾向地图，而不是替你签字的判决书。

## Step 2：核心出生盘信息
[太阳 - 狮子座 - 第10宫] [月亮 - 双鱼座 - 第5宫] [金星 - 天秤座 - 第12宫]

## Step 5：当前大运
重要：当前阶段更适合修正职业路径与关系选择，而不是把旧模式继续推到极限。

## Step 7：七大维度总结
- 事业：适合把专业能力做成可复用的产品或咨询结构。
- 财务：高峰来自复利型资产，而非单次劳动收入。
- 感情：需要分辨强烈吸引与真正滋养。
- 成长：风险不是看不见命运，而是看见后仍旧重复旧选择。`,
  career: [
    `## Phase 1: 职场生态位审计报告
1. **L10 核心扫描：** 职业场景偏向信息处理、咨询、技术与跨界协作。
2. **定性归类：** 商贸/自由/创意型与隐形/深层/虚拟型复合。
3. **风险警告：** 警告：若长期进入高压组织，容易出现付出与回报不成比例的问题。`,
    `## Phase 2: 天赋与变现审计报告
- **格局名称：** Dhana Yoga 倾向
- **强度评级：** 中
- **>>> Phase 4 强制策略指令 <<<：** 必须将才华连接到产品、咨询、课程或长期资产。

**变现管道校验：** 适合路径 A（产品/资产型）与路径 B（流量/服务型）并行。`,
    `## Phase 3: D9 深度职业内核与果实审计报告
### 1. 武器库压力测试
核心能力在 D9 中更像是慢热型专精：早期不一定显眼，但越复盘越锋利。

### 2. 职业内核解码
你是披着内容/咨询外衣的系统架构者。真正的工作是把混乱经验整理成可执行方法。`,
    `## Phase 4: 全维职业决策书
### 1. 精密职业画像
**身份定义：** 基于洞察、结构与表达的知识产品架构师。

### 3. 战略决策
最终建议：双轨并行。保留稳定现金流，同时把个人方法论做成可售卖资产。

### 5. 架构师箴言
你不是来寻找一个职位的，你是来为自己的能力建一座可长期运转的系统。`,
  ],
  love: `### 1. 我的恋爱体质报告
- **风格定义：** 深度感应型，容易被强烈、神秘或不按常理出牌的人吸引。
- **D9 深度评估：** 真正滋养你的关系必须允许你保持精神独立。

### 2. 未来 3 年桃花时间轴
- **窗口 1（03/2027 - 08/2027）：**
  - **触发机制：** 社交圈与远程沟通被点亮。
  - **关系性质：** 暧昧与心动机会较多，需要筛选。
- **窗口 2（11/2027 - 04/2028）：**
  - **关系性质：** 严肃关系概率上升。
- **窗口 3（06/2028 - 12/2028）：**
  - **关系性质：** 有落地、官宣或关系定型的机会。

### 3. 现代恋爱建议
风险：不要把“强烈”误认成“深刻”。先看对方是否稳定、负责、愿意把关系带入现实。`,
  life: `## 1. 灵魂的核心课题
你的核心课题不是证明自己值得被爱，而是学会在真实边界里发光。

## 2. 识别“定业”与惯性
> 惯性模式：在关系或事业里过早承担过多，随后因失衡而耗竭。

## 3. 转化与修行的行动指南
- Step 1：每次重大承诺前，写下自己的真实代价。
- Step 2：把“我应该”改写成“我选择”。
- Step 3：练习用小而清晰的拒绝保护长期能量。

## 4. 总结：生命的最终愿景
当你不再靠过度承担换取位置，你会成为一个既温柔又有边界、既敏感又能创造秩序的人。`,
};

function renderHome() {
  if (capacityRefreshTimer) {
    clearTimeout(capacityRefreshTimer);
    capacityRefreshTimer = null;
  }

  app.replaceChildren(homeTemplate.content.cloneNode(true));
  const pdfInput = app.querySelector("#pdfInput");
  const dropzone = app.querySelector("#dropzone");
  const startButton = app.querySelector("#startButton");
  const fileChip = app.querySelector("#fileChip");
  const fileMeta = app.querySelector("#fileMeta");
  const removeFile = app.querySelector("#removeFile");
  const intakeNotice = app.querySelector("#intakeNotice");
  let capacity = { ...state.capacity };


  function sync() {
    const intakeClosed = capacity.checking || !capacity.accepting;
    fileChip.classList.toggle("hidden", !state.pdfFile);
    if (state.pdfFile) {
      fileMeta.textContent = `${state.pdfFile.name} · ${formatSize(state.pdfFile.size)}`;
    }
    app.querySelectorAll(".gender-card").forEach((button) => {
      const selected = button.dataset.gender === state.gender;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });

    intakeNotice.hidden = false;
    intakeNotice.textContent = capacity.message;
    intakeNotice.classList.toggle("available", capacity.accepting && !capacity.checking);
    pdfInput.disabled = intakeClosed;
    dropzone.classList.toggle("paused", intakeClosed);
    if (intakeClosed) dropzone.removeAttribute("for");
    else dropzone.setAttribute("for", "pdfInput");

    startButton.disabled = intakeClosed || !state.pdfFile || !state.gender;
    startButton.textContent = capacity.checking
      ? "正在查询排队名额"
      : capacity.billingPaused
        ? "Gemini 余额不足，暂停上传"
        : capacity.dailyLimitReached
          ? "今日分析额度已达上限"
          : !capacity.accepting
          ? "当前 5 份名额已满"
          : "开始解读星盘";
    startButton.title = intakeClosed
      ? capacity.message
      : startButton.disabled ? "请先上传星盘 PDF 并选择性别" : "开始解读星盘";
  }

  pdfInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await setPdfFile(file);
    sync();
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (capacity.checking || !capacity.accepting) return;
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    if (capacity.checking || !capacity.accepting) return;
    dropzone.classList.remove("dragging");
    const file = event.dataTransfer.files?.[0];
    if (file) await setPdfFile(file);
    sync();
  });

  app.querySelectorAll(".gender-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.gender = button.dataset.gender;
      sync();
    });
  });

  removeFile.addEventListener("click", () => {
    state.pdfFile = null;
    state.pdfBase64 = "";
    pdfInput.value = "";
    sync();
  });

  startButton.addEventListener("click", async () => {
    if (capacity.checking || !capacity.accepting) return;
    await startFullAnalysis();
  });

  async function refreshCapacity() {
    if (isLocalPreview && !state.workerEndpoint) {
      capacity = {
        checking: false,
        accepting: true,
        activeJobs: 0,
        maxActiveJobs: 5,
        billingPaused: false,
        dailyLimitReached: false,
        resumeAt: 0,
        message: "本地预览模式，可以测试上传界面。",
      };
    } else {
      try {
        const response = await fetch(capacityEndpoint(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "暂时无法查询排队名额。");
        capacity = {
          checking: false,
          accepting: Boolean(data.accepting),
          activeJobs: Number(data.activeJobs || 0),
          maxActiveJobs: Number(data.maxActiveJobs || 5),
          billingPaused: Boolean(data.billingPaused),
          dailyLimitReached: Boolean(data.dailyLimitReached),
          resumeAt: Number(data.resumeAt || 0),
          message: data.message || QUEUE_CAPACITY_MESSAGE,
        };
      } catch {
        capacity = {
          ...capacity,
          checking: false,
          accepting: false,
          message: "暂时无法确认排队名额，请稍后刷新页面。",
        };
      }
    }

    state.capacity = { ...capacity };
    if (!document.body.contains(startButton)) return;
    sync();
    scheduleCapacityRefresh(capacity, refreshCapacity);
  }

  sync();
  refreshCapacity();
}

function capacityEndpoint() {
  return state.workerEndpoint.replace(/\/api\/jobs\/?$/, "/api/capacity");
}

function scheduleCapacityRefresh(capacity, refresh) {
  if (capacityRefreshTimer || capacity.accepting) return;
  let delay = 60000;
  if (capacity.dailyLimitReached && capacity.resumeAt) {
    delay = Math.max(60000, capacity.resumeAt * 1000 - Date.now() + 2000);
  } else if (document.visibilityState === "hidden") {
    delay = 300000;
  }
  capacityRefreshTimer = window.setTimeout(() => {
    capacityRefreshTimer = null;
    refresh();
  }, delay);
}
async function setPdfFile(file) {
  if (state.analysisStarted) resetAnalysisState();
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    alert("请上传 PDF 文件。");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("建议上传 10MB 以内的 PDF。");
    return;
  }
  state.pdfFile = file;
  state.pdfBase64 = await fileToBase64(file);
}

async function startFullAnalysis() {
  location.hash = "#/result";
  if (state.analysisStarted) {
    renderCurrentRoute();
    return;
  }

  state.analysisStarted = true;
  state.analysisFailed = false;
  state.completedJobs = 0;
  state.jobId = "";
  state.jobStatus = "submitting";
  state.queuePosition = 0;
  state.lastError = "";
  state.errorCode = "";
  state.currentTask = "正在提交星盘分析任务";
  state.startedAt = Date.now();
  state.loading.overview = true;
  state.loading.career = true;
  state.loading.love = true;
  state.loading.life = true;
  startProgressTimer();
  renderCurrentRoute();
  runQueuedAnalysis();
}

async function runQueuedAnalysis() {
  try {
    if (!state.workerEndpoint) {
      if (!isLocalPreview) throw new Error("后台排队服务暂未连接。");
      await runLocalSimulation();
      return;
    }

    const response = await fetch(state.workerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gender: state.gender,
        pdfBase64: state.pdfBase64,
        fileName: state.pdfFile?.name || "",
        mimeType: "application/pdf",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(data.error || "后端返回了错误：" + response.status);
      requestError.code = data.code || "";
      throw requestError;
    }
    if (!data.jobId) {
      throw new Error("后台没有返回任务编号，请稍后再试。");
    }

    state.jobId = data.jobId;
    state.jobStatus = data.status || "queued";
    state.queuePosition = Number(data.queuePosition || 1);
    state.currentTask = data.currentTask || "等待进入分析队列";
    saveActiveJob();
    renderCurrentRoute();
    await pollQueuedJob();
  } catch (error) {
    if (["QUEUE_FULL", "DAILY_LIMIT_REACHED", "BILLING_PAUSED"].includes(error?.code)) {
      stopProgressTimer();
      state.analysisStarted = false;
      state.analysisFailed = false;
      state.jobStatus = "idle";
      state.currentTask = "等待启动";
      state.loading.overview = false;
      state.loading.career = false;
      state.loading.love = false;
      state.loading.life = false;
      state.capacity = {
        ...state.capacity,
        checking: false,
        accepting: false,
        billingPaused: error.code === "BILLING_PAUSED",
        dailyLimitReached: error.code === "DAILY_LIMIT_REACHED",
        message: error.message,
      };
      location.hash = "#/";
      alert(error.message);
      return;
    }
    failQueuedAnalysis(error?.message || "后台排队服务暂时不可用。");
  }
}

async function pollQueuedJob() {
  while (state.analysisStarted && state.jobId) {
    let pollDelay = 60000;

    try {
      const response = await fetch(
        state.workerEndpoint + "/" + encodeURIComponent(state.jobId),
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "查询任务失败：" + response.status);
      }

      applyJobSnapshot(data);
      saveActiveJob();
      renderCurrentRoute();

      if (data.status === "completed" || data.status === "failed") {
        stopProgressTimer();
        return;
      }

      pollDelay = jobPollDelay(data.status, Number(data.queuePosition || 0));
    } catch (error) {
      state.currentTask = "网络暂时中断，稍后自动重新连接任务";
      state.lastError = error?.message || "查询任务失败";
      renderCurrentRoute();
    }

    await wait(jitteredPollDelay(pollDelay));
  }
}

function jobPollDelay(status, queuePosition) {
  let delay;

  if (status === "processing") delay = 15000;
  else if (status !== "queued") delay = 60000;
  else if (queuePosition <= 1) delay = 30000;
  else if (queuePosition <= 5) delay = 60000;
  else if (queuePosition <= 20) delay = 120000;
  else if (queuePosition <= 50) delay = 300000;
  else delay = 600000;

  return document.visibilityState === "hidden" ? Math.max(delay, 300000) : delay;
}

function jitteredPollDelay(delay) {
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(delay * jitter);
}

function applyJobSnapshot(data) {
  state.jobStatus = data.status || state.jobStatus;
  state.queuePosition = Number(data.queuePosition || 0);
  state.completedJobs = Number(data.completedJobs || 0);
  state.currentTask = data.currentTask || state.currentTask;
  state.lastError = data.errorMessage || "";
  state.errorCode = data.errorCode || "";
  state.results.overview = data.results?.overview || "";
  state.results.career = Array.isArray(data.results?.career)
    ? data.results.career.slice(0, 4)
    : ["", "", "", ""];
  while (state.results.career.length < 4) state.results.career.push("");
  state.results.love = data.results?.love || "";
  state.results.life = data.results?.life || "";

  const stopped = state.jobStatus === "failed";
  state.analysisFailed = stopped;
  state.loading.overview = !state.results.overview && !stopped;
  state.loading.career = !state.results.career.every(Boolean) && !stopped;
  state.loading.love = !state.results.love && !stopped;
  state.loading.life = !state.results.life && !stopped;

  if (state.jobStatus === "completed") {
    state.completedJobs = state.totalJobs;
    state.currentTask = "全部报告已生成";
  }
}

function failQueuedAnalysis(message) {
  state.analysisFailed = true;
  state.jobStatus = "failed";
  state.lastError = message;
  state.currentTask = "本次生成未完成";
  state.loading.overview = false;
  state.loading.career = false;
  state.loading.love = false;
  state.loading.life = false;
  stopProgressTimer();
  renderCurrentRoute();
}

async function runLocalSimulation() {
  const rounds = [
    ["overview", 0, "大致分析"],
    ["career", 0, "事业 Phase 1"],
    ["career", 1, "事业 Phase 2"],
    ["career", 2, "事业 Phase 3"],
    ["career", 3, "事业 Phase 4"],
    ["love", 0, "爱情分析"],
    ["life", 0, "人生指南"],
  ];
  state.jobId = "local-preview";
  state.jobStatus = "processing";

  for (let index = 0; index < rounds.length; index += 1) {
    const [key, phase, label] = rounds[index];
    state.currentTask = "正在生成" + label;
    renderCurrentRoute();
    await wait(400);
    if (key === "career") state.results.career[phase] = sampleResults.career[phase];
    else state.results[key] = sampleResults[key];
    state.completedJobs = index + 1;
    applyJobSnapshot({
      status: index === rounds.length - 1 ? "completed" : "processing",
      completedJobs: state.completedJobs,
      currentTask: label + "已完成",
      results: state.results,
    });
  }
  stopProgressTimer();
  renderCurrentRoute();
}

function saveActiveJob() {
  if (!state.jobId || state.jobId === "local-preview") return;
  localStorage.setItem("astraActiveJob", JSON.stringify({
    jobId: state.jobId,
    fileName: state.pdfFile?.name || "星盘.pdf",
    gender: state.gender,
    startedAt: state.startedAt,
  }));
}

function restoreActiveJob() {
  if (isLocalPreview) return;
  try {
    const saved = JSON.parse(localStorage.getItem("astraActiveJob") || "null");
    if (!saved?.jobId) return;
    state.jobId = saved.jobId;
    state.gender = saved.gender || "";
    state.pdfFile = { name: saved.fileName || "星盘.pdf", size: 0 };
    state.analysisStarted = true;
    state.jobStatus = "queued";
    state.currentTask = "正在恢复后台任务";
    state.startedAt = Number(saved.startedAt || Date.now());
    state.loading.overview = true;
    state.loading.career = true;
    state.loading.love = true;
    state.loading.life = true;

    const currentHash = location.hash || "#/";
    if (currentHash === "#/" || currentHash === "#") {
      history.replaceState(null, "", "#/result");
    }

    startProgressTimer();
    pollQueuedJob();
  } catch {
    localStorage.removeItem("astraActiveJob");
  }
}

function resetAnalysisState() {
  stopProgressTimer();
  localStorage.removeItem("astraActiveJob");
  state.analysisStarted = false;
  state.analysisFailed = false;
  state.jobId = "";
  state.jobStatus = "idle";
  state.queuePosition = 0;
  state.lastError = "";
  state.errorCode = "";
  state.completedJobs = 0;
  state.currentTask = "等待启动";
  state.results = {
    overview: "",
    career: ["", "", "", ""],
    love: "",
    life: "",
  };
  state.loading = {
    overview: false,
    career: false,
    love: false,
    life: false,
  };
}
function renderResult() {
  app.innerHTML = `
    <section class="result-layout">
      <div class="result-hero">
        <p class="eyebrow">${gatewayStatusLabel()}</p>
        <h1 class="page-title">你的星盘解读入口</h1>
        <p class="manifesto" style="margin:0;max-width:720px;text-align:left">
          总览会先展开命运底色；事业、爱情与人生指南可继续进入详情页。每个模块都保持“倾向而非定论”的原则。
        </p>
        <div class="status-strip">
          <span class="badge">PDF：${state.pdfFile ? escapeHtml(state.pdfFile.name) : "未上传"}</span>
          <span class="badge pink">性别：${state.gender || "未选择"}</span>
          <span class="badge amber">${workerStatusLabel()}</span>
        </div>
      </div>

      ${renderProgressPanel()}

      <article class="result-card">
        <header>
          <div>
            <p class="eyebrow">OVERVIEW / STEP 1-7</p>
            <h2>大致分析</h2>
          </div>
          <button class="inline-action" id="toggleOverview" type="button">${state.overviewExpanded ? "收起 ↑" : "展开完整分析 ↓"}</button>
        </header>
        <p class="microcopy">七大维度全景速览 — 事业 · 财务 · 感情 · 婚姻 · 家庭 · 健康 · 成长。</p>
        ${
          state.loading.overview
            ? loadingBlock("正在解读你的星盘...", loadingMessage())
            : `<div class="result-content${state.overviewExpanded ? "" : " collapsed"}" id="overviewContent">${renderMarkdown(cleanModelText(state.results.overview || "尚未开始分析。"))}</div>`
        }
      </article>

      <div class="module-grid">
        ${moduleCards
          .map(
            (card) => `
              <a class="module-card" href="${card.href}">
                <p class="eyebrow">${card.eyebrow}</p>
                <h2>${card.title}</h2>
                <p>${card.text}</p>
                <div class="arrow">ENTER →</div>
              </a>
            `,
          )
          .join("")}
      </div>
    </section>
  `;

  const toggle = app.querySelector("#toggleOverview");
  const content = app.querySelector("#overviewContent");
  if (toggle && content) {
    toggle.addEventListener("click", () => {
      const collapsed = content.classList.toggle("collapsed");
      state.overviewExpanded = !collapsed;
      toggle.textContent = collapsed ? "展开完整分析 ↓" : "收起 ↑";
    });
  }
}

function renderCareer() {
  app.innerHTML = `
    <section class="page-stack">
      ${pageHeader("CAREER ARCHITECTURE", "事业架构", "4 个 Phase 会顺序生成，从职场生态位走到最终职业决策。")}
      <div class="phase-list two-col">
        ${careerPhases
          .map((phase, index) => {
            const body = state.results.career[index]
              ? `<div class="result-content">${renderMarkdown(cleanModelText(state.results.career[index]))}</div>`
              : state.loading.career
                ? loadingBlock(`Phase ${index + 1}/4 分析中...`, "系统已帮你自动指示进入下一阶段，下一阶段报告生成中，请耐心等待。")
                : `<p class="microcopy">等待进入分析队列。</p>`;
            return `<article class="phase-card"><p class="eyebrow">PHASE ${index + 1}/4</p><h2>${phase[0]}</h2><p>${phase[1]}</p>${body}</article>`;
          })
          .join("")}
      </div>
      ${
        state.results.career.every(Boolean)
          ? `<div class="vision-card"><div><p class="eyebrow">THE CLOSING MANTRA</p><h2>架构师箴言已生成</h2></div></div>`
          : ""
      }
    </section>
  `;
}

function renderLove() {
  renderLazyPage({
    key: "love",
    eyebrow: "LOVE TIMELINE",
    title: "爱情推演",
    intro: "恋爱体质、未来三年桃花窗口与现代恋爱避坑建议。",
    loadingText: "正在推演你的桃花时间轴...",
    after: loveTimeline(),
  });
}

function renderLife() {
  renderLazyPage({
    key: "life",
    eyebrow: "SOUL BLUEPRINT",
    title: "人生指南",
    intro: "灵魂课题、业力惯性、转化练习与生命最终愿景。",
    loadingText: "正在解读你的灵魂蓝图...",
    after: `<div class="vision-card"><div><p class="eyebrow">VISION</p><h2>星辰不是囚笼，是地图。</h2></div></div>`,
  });
}

function renderLazyPage(config) {
  app.innerHTML = `
    <section class="page-stack">
      ${pageHeader(config.eyebrow, config.title, config.intro)}
      <article class="result-card">
        ${
          state.loading[config.key]
            ? loadingBlock(config.loadingText)
            : `<div class="result-content">${renderMarkdown(cleanModelText(state.results[config.key] || (state.analysisFailed ? "本轮报告未完成，请稍后重新开始分析。" : state.analysisStarted ? "报告正在生成中，请稍后回来查看。" : "尚未开始分析。")))}</div>${config.after || ""}`
        }
      </article>
    </section>
  `;
}

function pageHeader(eyebrow, title, intro) {
  return `
    <div class="result-hero">
      <p class="eyebrow">${eyebrow}</p>
      <h1 class="page-title">${title}</h1>
      <p class="manifesto" style="margin:0;max-width:720px;text-align:left">${intro}</p>
    </div>
  `;
}

function loveTimeline() {
  return `
    <div class="timeline" aria-label="桃花时间轴图例">
      <div class="timeline-item"><span class="timeline-dot"></span><div><strong>粉色</strong><p class="microcopy">纯恋爱 / 暧昧</p></div></div>
      <div class="timeline-item serious"><span class="timeline-dot"></span><div><strong>紫色</strong><p class="microcopy">严肃关系</p></div></div>
      <div class="timeline-item official"><span class="timeline-dot"></span><div><strong>金色</strong><p class="microcopy">官宣 / 落地</p></div></div>
    </div>
  `;
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let listOpen = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (listOpen) {
        html += "</ul>";
        listOpen = false;
      }
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (listOpen) html += "</ul>";
      listOpen = false;
      const tag = heading[1].length <= 2 ? "h2" : "h3";
      html += `<${tag}>${inline(heading[2])}</${tag}>`;
    } else if (line.startsWith(">")) {
      if (listOpen) html += "</ul>";
      listOpen = false;
      html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (/^\d+\.\s+/.test(line)) {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`;
    } else {
      if (listOpen) {
        html += "</ul>";
        listOpen = false;
      }
      const warn = /风险|警告|重要|谨慎|不利/.test(line) ? " warning-block" : "";
      html += `<p class="${warn.trim()}">${inline(line)}</p>`;
    }
  }
  if (listOpen) html += "</ul>";
  return html;
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(高|中|低)(?=评级|强度|可信)/g, '<span class="badge amber">$1</span>')
    .replace(/【(粉色|紫色|金色)(?:\s*[｜|/]\s*[^】]+)?】/g, (_, color) => {
      const tone = { 粉色: "pink", 紫色: "violet", 金色: "gold" }[color];
      return `<span class="timeline-tag ${tone}">${color}</span>`;
    })
    .replace(/\[([^\]]+ - [^\]]+ - [^\]]+)\]/g, '<span class="planet-chip">$1</span>');
}

function loadingBlock(text, detail = "") {
  return `<div class="skeleton" role="status" aria-label="${escapeHtml(text)}"></div><p class="microcopy">${escapeHtml(text)}</p>${detail ? `<p class="microcopy wait-note">${escapeHtml(detail)}</p>` : ""}`;
}

function renderProgressPanel() {
  if (!state.analysisStarted) return "";
  const percent = Math.round((state.completedJobs / state.totalJobs) * 100);
  const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  const queueAhead = Math.max(0, state.queuePosition - 1);
  const estimatedSeconds = Math.max(0, queueAhead * 240 + 420 - elapsed);
  const done = state.jobStatus === "completed" || state.completedJobs >= state.totalJobs;
  const queued = state.jobStatus === "queued" || state.jobStatus === "submitting";
  const billingPaused = state.errorCode === "BILLING_CREDITS_DEPLETED";
  const dailyPaused = state.errorCode === "GEMINI_DAILY_QUOTA_EXCEEDED";
  const timerText = done
    ? "完成"
    : state.analysisFailed
      ? "已停止"
      : billingPaused
        ? "免费额度切换后继续"
        : dailyPaused
          ? "明日额度恢复后继续"
          : queued && state.queuePosition > 0
          ? "排队第 " + state.queuePosition + " 位"
          : estimatedSeconds > 0
            ? "预计还需 " + formatCountdown(estimatedSeconds)
            : "仍在处理中";
  const note = done
    ? "全部报告已经生成完成，可以开始阅读各个板块。"
    : state.analysisFailed
      ? (state.lastError || "本次没有得到完整报告，请稍后重新开始。")
      : billingPaused
        ? `Gemini 付费余额已经用完，网站正在切换免费额度。已完成的 ${state.completedJobs}/${state.totalJobs} 轮报告均已保存，PDF 和当前任务也会继续保留；恢复后系统会从下一轮自动继续，不会重做已经完成的内容。已完成的板块现在就可以先查看。`
        : dailyPaused
          ? `今天的 Gemini 免费分析额度已经用完。已完成的 ${state.completedJobs}/${state.totalJobs} 轮报告均已保存，PDF 和当前任务也会继续保留；额度恢复后，系统会从下一轮自动继续，不会重做已经完成的内容。已完成的板块现在就可以先查看。`
          : queued
          ? "任务已经进入全站队列。当前同一时间只处理一份星盘，轮到你后会自动开始；可以保持页面打开，也可以稍后回来。"
          : state.lastError
            ? state.lastError + " 系统会从当前轮次自动继续，不会重做已完成的报告。"
            : "系统正在同一段 Gemini 会话中串行生成 7 轮报告；每完成一轮都会立即保存，已完成的板块可以先查看。";
  const heading = done
    ? "报告已生成完成"
    : state.analysisFailed
      ? "本次生成未完成"
      : billingPaused
        ? "付费余额已用完，任务已暂停"
        : dailyPaused
          ? "今日额度已用完，任务已暂停"
          : queued
          ? "任务排队中"
          : "星盘报告生成中";

  return [
    '<section class="progress-card" aria-live="polite">',
      '<div class="progress-topline">',
        '<div>',
          '<p class="eyebrow">GENERATION PROGRESS</p>',
          '<h2>' + heading + '</h2>',
        '</div>',
        '<span class="badge amber">' + state.completedJobs + '/' + state.totalJobs + '</span>',
      '</div>',
      '<div class="progress-track"><span style="width:' + percent + '%"></span></div>',
      '<div class="progress-meta">',
        '<span>' + escapeHtml(getProgressMessage()) + '</span>',
        '<span>' + escapeHtml(timerText) + '</span>',
      '</div>',
      '<p class="microcopy wait-note">' + escapeHtml(note) + '</p>',
    '</section>',
  ].join("");
}

function getProgressMessage() {
  if (state.completedJobs >= state.totalJobs) return "全部报告已生成";
  if (state.errorCode === "BILLING_CREDITS_DEPLETED") {
    return state.completedJobs > 0
      ? "已完成 " + state.completedJobs + "/" + state.totalJobs + "，进度已保存"
      : "任务与 PDF 已保留，等待免费额度切换";
  }
  if (state.errorCode === "GEMINI_DAILY_QUOTA_EXCEEDED") {
    return state.completedJobs > 0
      ? "已完成 " + state.completedJobs + "/" + state.totalJobs + "，进度已保存"
      : "任务与 PDF 已保留，等待额度恢复";
  }
  if (state.jobStatus === "queued" && state.queuePosition > 0) {
    return state.queuePosition === 1 ? "下一份就是你的报告" : "前面还有 " + (state.queuePosition - 1) + " 份报告";
  }
  if (state.completedJobs > 0) return "已完成 " + state.completedJobs + "/" + state.totalJobs + "，已完成的板块可以先查看";
  return state.currentTask;
}
function loadingMessage() {
  if (state.jobStatus === "queued") {
    return "任务正在全站队列中等待，轮到你后会自动读取 PDF 并建立星盘上下文。";
  }
  return "第一轮正在读取 PDF 并建立星盘上下文，后续报告会沿用同一段 Gemini 会话继续生成。";
}

function gatewayStatusLabel() {
  if (state.jobStatus === "completed") return "READING COMPLETE / GATEWAY";
  if (state.analysisFailed) return "READING INTERRUPTED / GATEWAY";
  if (state.jobStatus === "queued" || state.jobStatus === "submitting") return "READING QUEUED / GATEWAY";
  return "READING IN PROGRESS / GATEWAY";
}
function formatCountdown(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function cleanModelText(markdown) {
  return String(markdown)
    .split(/\r?\n/)
    .filter((line) => !/请指示是否进入\s*Phase|等待我发送\s*Phase|请在输出后暂停|等待下一阶段/.test(line))
    .join("\n")
    .replace(/={2,}\s*$/gm, "");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function startProgressTimer() {
  if (progressTimer) return;
  progressTimer = setInterval(() => {
    if (!state.analysisStarted || state.completedJobs >= state.totalJobs) {
      stopProgressTimer();
      return;
    }
    const hash = location.hash || "#/";
    if (hash === "#/result") {
      renderCurrentRoute();
    }
  }, 1000);
}

function stopProgressTimer() {
  if (!progressTimer) return;
  clearInterval(progressTimer);
  progressTimer = null;
}
function renderCurrentRoute() {
  route();
}

function route() {
  const hash = location.hash || "#/";
  if (hash === "#/" || hash === "#") renderHome();
  else if (hash === "#/result") renderResult();
  else if (hash === "#/result/career") renderCareer();
  else if (hash === "#/result/love") renderLove();
  else if (hash === "#/result/life") renderLife();
  else location.hash = "#/";
  requestAnimationFrame(() => app.focus());
}

function initSettings() {
  if (!isLocalPreview) {
    settingsButton.hidden = true;
    return;
  }
  workerEndpointInput.value = state.workerEndpoint;
  settingsButton.addEventListener("click", () => {
    workerEndpointInput.value = state.workerEndpoint;
    settingsDialog.showModal();
  });
  document.querySelector("#saveSettings").addEventListener("click", () => {
    state.workerEndpoint = workerEndpointInput.value.trim();
    localStorage.setItem("astraWorkerEndpoint", state.workerEndpoint);
  });
}

function workerStatusLabel() {
  if (state.workerEndpoint) return "Cloudflare 后台队列已连接";
  return isLocalPreview ? "本地模拟模式" : "服务待配置";
}

function initBack() {
  backButton.addEventListener("click", () => {
    const hash = location.hash || "#/";
    if (hash.startsWith("#/result/")) location.hash = "#/result";
    else if (hash === "#/result") location.hash = "#/";
    else history.back();
  });
}

function initStarfield() {
  const canvas = document.querySelector("#starfield");
  const ctx = canvas.getContext("2d");
  const points = Array.from({ length: 80 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.6,
    s: 0.15 + Math.random() * 0.45,
    a: 0.2 + Math.random() * 0.55,
  }));
  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of points) {
      p.y -= p.s / canvas.height;
      if (p.y < -0.02) p.y = 1.02;
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      ctx.beginPath();
      ctx.fillStyle = `rgba(0, 212, 255, ${p.a})`;
      ctx.arc(x, y, p.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const dx = (a.x - b.x) * canvas.width;
        const dy = (a.y - b.y) * canvas.height;
        const distance = Math.hypot(dx, dy);
        if (distance < 110 * devicePixelRatio) {
          ctx.strokeStyle = `rgba(77, 159, 255, ${0.06 * (1 - distance / (110 * devicePixelRatio))})`;
          ctx.beginPath();
          ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
          ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  resize();
  draw();
  window.addEventListener("resize", resize);
}

window.addEventListener("hashchange", route);
initSettings();
initBack();
initStarfield();
restoreActiveJob();
route();




