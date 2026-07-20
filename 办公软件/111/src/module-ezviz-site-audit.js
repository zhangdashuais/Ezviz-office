(function () {
  const runButton = document.getElementById("ezvizSiteAuditRunBtn");
  const sampleSizeInput = document.getElementById("ezvizSiteAuditSampleSize");
  const statusElement = document.getElementById("ezvizSiteAuditStatus");
  const outputElement = document.getElementById("ezvizSiteAuditOutput");
  const scheduleElement = document.getElementById("ezvizSiteAuditScheduleStatus");
  if (!runButton || !sampleSizeInput || !statusElement || !outputElement) return;

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "warn");
    if (type) statusElement.classList.add(type);
  }

  function progressText(progress) {
    if (!progress) return "任务已启动，正在准备浏览器环境...";
    if (progress.type === "sites-discovered") return `已发现 ${progress.totalSites} 个站点。`;
    if (progress.type === "site-started") return `正在巡查站点 ${progress.siteIndex + 1}/${progress.totalSites}：${progress.site.name}`;
    if (progress.type === "product-started") {
      return `正在巡查 ${progress.site} 的产品 ${progress.productIndex + 1}/${progress.sampleSize}：${progress.product || "未命名产品"}`;
    }
    if (progress.type === "product-finished") return `${progress.site} / ${progress.product || "未命名产品"} 完成，发现 ${progress.issueCount} 个问题。`;
    if (progress.type === "site-finished") return `${progress.site} 完成，发现 ${progress.issueCount} 个问题。`;
    return JSON.stringify(progress);
  }

  function renderJob(job) {
    const lines = [
      `任务：${job.id}`,
      `状态：${job.status}`,
      `每站抽样：${job.sampleSize}`,
      `开始：${job.startedAt || ""}`,
      `结束：${job.finishedAt || ""}`,
      ""
    ];

    if (job.result) {
      lines.push(`站点数：${job.result.sites.length}`);
      lines.push(`问题数：${job.result.issueCount}`);
      lines.push("");
      job.result.sites.forEach((site) => {
        lines.push(`【${site.name}】${site.url}`);
        if (site.error) lines.push(`  站点错误：${site.error}`);
        site.categories.forEach((category) => lines.push(`  ${category.name}：${category.productCount} 个产品`));
        site.sampledProducts.forEach((product) => {
          lines.push(`  - ${product.productName || "未命名产品"} [${product.category}]`);
          lines.push(`    ${product.detailUrl}`);
          lines.push(`    标语：${product.tagline || "（空）"}`);
          lines.push(`    问题：${product.issues.length ? product.issues.map((issue) => issue.type).join(", ") : "无"}`);
        });
        if (site.issues.length) {
          lines.push("  站点问题清单：");
          site.issues.forEach((issue) => lines.push(`    - ${issue.product ? issue.product + "：" : ""}${issue.type}`));
        }
        lines.push("");
      });
    } else {
      (job.logs || []).slice(-50).forEach((log) => lines.push(`[${log.at}] ${progressText(log)}`));
    }

    if (job.error) lines.push(`任务错误：${job.error}`);
    outputElement.value = lines.join("\n");
    outputElement.scrollTop = outputElement.scrollHeight;
  }

  async function loadSchedule() {
    if (!scheduleElement) return;
    try {
      const response = await fetch("/api/ezviz-site-audit/schedule");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "读取失败");
      const schedule = payload.schedule;
      const next = schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "等待计算";
      const last = schedule.lastFinishedAt ? new Date(schedule.lastFinishedAt).toLocaleString() : "尚未执行";
      scheduleElement.textContent = `定时巡查已启用：每 ${schedule.intervalDays} 天；上次完成：${last}；下次执行：${next}；最近 Excel：${schedule.lastReportPath || "尚未生成"}`;
    } catch (error) {
      scheduleElement.textContent = `定时巡查状态读取失败：${error?.message || String(error)}`;
      scheduleElement.classList.add("warn");
    }
  }

  async function pollJob(jobId) {
    while (true) {
      const response = await fetch(`/api/ezviz-site-audit/jobs/${encodeURIComponent(jobId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "读取巡查任务失败");
      const job = payload.job;
      renderJob(job);
      setStatus(progressText(job.progress), job.status === "failed" ? "warn" : "");
      if (job.status !== "running") {
        setStatus(
          job.status === "completed" ? `巡查完成，共发现 ${job.result?.issueCount || 0} 个问题。` : `巡查失败：${job.error || "未知错误"}`,
          job.status === "completed" ? "ok" : "warn"
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  runButton.addEventListener("click", async () => {
    const sampleSize = Math.min(20, Math.max(1, Number(sampleSizeInput.value) || 5));
    sampleSizeInput.value = String(sampleSize);
    runButton.disabled = true;
    setStatus("正在创建 EZVIZ 官网巡查任务...");
    outputElement.value = "";
    try {
      const response = await fetch("/api/ezviz-site-audit/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleSize })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "创建巡查任务失败");
      renderJob(payload.job);
      await pollJob(payload.job.id);
    } catch (error) {
      setStatus(`巡查失败：${error?.message || String(error)}`, "warn");
    } finally {
      runButton.disabled = false;
    }
  });

  loadSchedule();
})();
