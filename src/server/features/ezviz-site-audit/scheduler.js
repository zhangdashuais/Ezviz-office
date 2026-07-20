const fs = require("fs");
const path = require("path");
const { writeAuditExcelReport } = require("./excel-report");

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return {}; }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function createEzvizSiteAuditScheduler(options) {
  const feature = options.feature;
  const intervalMs = Math.max(60000, Number(options.intervalMs) || TWO_DAYS_MS);
  const sampleSize = Math.min(20, Math.max(1, Number(options.sampleSize) || 5));
  const outputDir = options.outputDir;
  const statePath = options.statePath;
  const checkEveryMs = Math.max(15000, Number(options.checkEveryMs) || 60000);
  let timer = null;
  let activeJobId = null;
  let state = readState(statePath);

  function nextRunTime() {
    if (state.nextRunAt) return new Date(state.nextRunAt).getTime();
    return Date.now();
  }

  function publicState() {
    return {
      enabled: true,
      intervalMs,
      intervalDays: intervalMs / 86400000,
      sampleSize,
      outputDir,
      activeJobId,
      lastStartedAt: state.lastStartedAt || null,
      lastFinishedAt: state.lastFinishedAt || null,
      lastStatus: state.lastStatus || null,
      lastError: state.lastError || null,
      lastReportPath: state.lastReportPath || null,
      nextRunAt: state.nextRunAt || new Date(nextRunTime()).toISOString()
    };
  }

  function persist(next) {
    state = { ...state, ...next };
    writeState(statePath, state);
  }

  function watchJob(job) {
    const watcher = setInterval(() => {
      const current = feature.getRandomAuditJob(job.id);
      if (!current || current.status === "running") return;
      clearInterval(watcher);
      activeJobId = null;
      const nextRunAt = new Date(Date.now() + intervalMs).toISOString();
      if (current.status === "completed" && current.result) {
        try {
          const reportPath = writeAuditExcelReport(current.result, { outputDir, job: current });
          current.reportPath = reportPath;
          persist({
            lastFinishedAt: current.finishedAt,
            lastStatus: "completed",
            lastError: null,
            lastReportPath: reportPath,
            nextRunAt
          });
        } catch (error) {
          persist({ lastFinishedAt: current.finishedAt, lastStatus: "report-failed", lastError: error.message, nextRunAt });
        }
      } else {
        persist({ lastFinishedAt: current.finishedAt, lastStatus: "failed", lastError: current.error, nextRunAt });
      }
    }, 5000);
    watcher.unref?.();
  }

  function runNow() {
    if (activeJobId || feature.hasRunningRandomAuditJob()) return null;
    const job = feature.startRandomAuditJob({ sampleSize, source: "schedule" });
    activeJobId = job.id;
    persist({ lastStartedAt: job.startedAt, lastStatus: "running", lastError: null });
    watchJob(job);
    return job;
  }

  function tick() {
    if (Date.now() >= nextRunTime()) runNow();
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, checkEveryMs);
    timer.unref?.();
    setTimeout(tick, 3000).unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, runNow, getState: publicState };
}

module.exports = { TWO_DAYS_MS, createEzvizSiteAuditScheduler };
