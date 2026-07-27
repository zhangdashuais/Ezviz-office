(() => {
  "use strict";

  const originalFetch = window.fetch.bind(window);
  const operations = [
    { pattern: /^\/api\/specification\/(preview|submit)$/, statusId: "specTranslationStatus", label: "Specification 翻译上架" },
    { pattern: /^\/api\/language-package\/upload$/, statusId: "languageStatus", label: "语言包上传" },
    { pattern: /^\/api\/campaign\/wtb-(plan|submit|roundtrip-test|restore)$/, statusId: "wtbStatus", label: "WTB 产品购买链接" },
    { pattern: /^\/api\/tdk\/(plan|submit)$/, statusId: "tdkStatus", label: "TDK 配置" },
    { pattern: /^\/api\/product-replacement\/(detail|details)$/, statusId: "productReplaceStatus", label: "后台产品读取" },
    { pattern: /^\/api\/product-revision-sync\/(preview|submit)$/, statusId: "revisionSyncStatus", label: "产品修订同步" }
  ];

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input.url;
      return new URL(raw, window.location.href).pathname;
    } catch (_error) {
      return "";
    }
  }

  function taskId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function formatElapsed(startedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
  }

  function ensurePanel(statusElement) {
    const panelId = `${statusElement.id}TaskProgress`;
    let panel = document.getElementById(panelId);
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = panelId;
    panel.className = "task-progress-panel";
    panel.innerHTML = [
      '<div class="task-progress-track"><div class="task-progress-bar"></div></div>',
      '<div class="task-progress-meta"></div>',
      '<div class="task-progress-actions"><button type="button" class="task-progress-stop">停止运行</button></div>',
      '<pre class="task-progress-log"></pre>'
    ].join("");
    statusElement.insertAdjacentElement("afterend", panel);
    const stopButton = panel.querySelector(".task-progress-stop");
    stopButton.addEventListener("click", async () => {
      const id = panel.dataset.taskId;
      if (!id || stopButton.disabled) return;
      stopButton.disabled = true;
      stopButton.textContent = "正在停止...";
      try {
        const response = await originalFetch(`/api/task-progress/${encodeURIComponent(id)}/cancel`, {
          method: "POST"
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || "停止请求失败。");
        statusElement.textContent = "已请求停止，正在等待当前安全步骤结束...";
        statusElement.classList.remove("ok", "warn");
      } catch (error) {
        stopButton.disabled = false;
        stopButton.textContent = "重新停止";
        statusElement.textContent = "停止请求失败：" + (error?.message || String(error));
        statusElement.classList.add("warn");
      }
    });
    return panel;
  }

function render(operation, job, updateMainStatus = true) {
    const statusElement = document.getElementById(operation.statusId);
    if (!statusElement) return;
    const panel = ensurePanel(statusElement);
    if (job.id) panel.dataset.taskId = job.id;
    const elapsed = formatElapsed(job.startedAt || Date.now());
    const running = job.status === "running";
    const cancelling = job.status === "cancelling";
    const cancelled = job.status === "cancelled";
    panel.classList.toggle("is-running", running);
    panel.classList.toggle("is-cancelling", cancelling);
    panel.classList.toggle("is-cancelled", cancelled);
    panel.classList.toggle("is-completed", job.status === "completed");
    panel.classList.toggle("is-failed", job.status === "failed");

    const stopButton = panel.querySelector(".task-progress-stop");
    stopButton.hidden = !(running || cancelling);
    stopButton.disabled = cancelling;
    stopButton.textContent = cancelling ? "正在停止..." : "停止运行";

    const statusLabel = running ? "运行中"
      : cancelling ? "正在停止"
        : cancelled ? "已停止"
          : job.status === "completed" ? "已完成" : "执行失败";
    panel.querySelector(".task-progress-meta").textContent =
      `${statusLabel}｜${running || cancelling ? "已用时" : "总用时"} ${elapsed}｜已记录 ${job.step || 0} 个步骤`;
    const recent = (job.logs || []).slice(-5).map((item) => `${item.step}. ${item.message}`);
    panel.querySelector(".task-progress-log").textContent = recent.length
      ? recent.join("\n")
      : (job.current || "正在准备执行环境...");
    if (updateMainStatus && (running || cancelling)) {
      statusElement.textContent = `${operation.label}：${job.current || "正在处理中..."}（${elapsed}，步骤 ${job.step || 0}）`;
      statusElement.classList.remove("ok", "warn");
    }
    if (updateMainStatus && cancelled) {
      statusElement.textContent = `${operation.label}：任务已停止。`;
      statusElement.classList.remove("ok");
      statusElement.classList.add("warn");
    }
  }
  async function readProgress(id, operation, updateMainStatus = true) {
    const response = await originalFetch(`/api/task-progress/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.job) render(operation, payload.job, updateMainStatus);
    return payload?.job || null;
  }

  window.fetch = async function progressFetch(input, init = {}) {
    const method = String(init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
    const operation = method === "POST"
      ? operations.find((item) => item.pattern.test(requestPath(input)))
      : null;
    if (!operation) return originalFetch(input, init);

    const id = taskId();
    const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
    headers.set("x-task-progress-id", id);
    const nextInit = { ...init, headers };
    const statusElement = document.getElementById(operation.statusId);
    if (statusElement) {
      render(operation, {
        id,
        status: "running",
        current: "请求已发出，等待服务器接收...",
        step: 0,
        logs: [],
        startedAt: Date.now()
      });
    }

    let timer = null;
    const poll = () => readProgress(id, operation).catch(() => null);
    timer = window.setInterval(poll, 800);
    try {
      const response = await originalFetch(input, nextInit);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await readProgress(id, operation, false).catch(() => null);
      return response;
    } catch (error) {
      const panel = statusElement ? ensurePanel(statusElement) : null;
      if (panel) {
        panel.classList.remove("is-running", "is-completed");
        panel.classList.add("is-failed");
        panel.querySelector(".task-progress-meta").textContent = "请求中断或网络异常";
        panel.querySelector(".task-progress-log").textContent = error?.message || String(error);
      }
      throw error;
    } finally {
      if (timer) window.clearInterval(timer);
    }
  };
})();