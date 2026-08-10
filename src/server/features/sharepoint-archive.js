const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

function publicPlan(plan) {
  return {
    siteUrl: plan.siteUrl,
    overwrite: plan.overwrite,
    folders: plan.folders,
    files: plan.files.map(({ localPath, ...file }) => file)
  };
}

function createSharePointArchive(deps) {
  const { root, logLine } = deps;
  const scriptPath = path.join(root, "scripts", "upload-sharepoint-archive.ps1");
  const jobRoot = path.join(root, "runtime", "sharepoint-archive-jobs");

  async function execute(plan, logs) {
    if (!fs.existsSync(scriptPath)) {
      throw new Error("未找到 SharePoint 上传脚本：" + scriptPath);
    }
    await fs.promises.mkdir(jobRoot, { recursive: true });
    const jobId = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    const manifestPath = path.join(jobRoot, `${jobId}.json`);
    await fs.promises.writeFile(manifestPath, JSON.stringify(plan, null, 2), "utf8");

    logLine(logs, `开始执行 SharePoint 归档：${plan.files.length} 个文件。`);
    let finalResult = null;
    let workerError = null;
    const stderr = [];

    try {
      await new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy", "Bypass",
          "-File", scriptPath,
          "-ManifestPath", manifestPath
        ], {
          cwd: root,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });

        const lines = readline.createInterface({ input: child.stdout });
        lines.on("line", (line) => {
          const text = String(line || "").trim();
          if (!text) return;
          try {
            const message = JSON.parse(text);
            if (message.type === "progress" && message.message) {
              logLine(logs, message.message);
            } else if (message.type === "result") {
              finalResult = message.result;
            } else if (message.type === "error") {
              workerError = message.message || "SharePoint 上传脚本执行失败。";
            }
          } catch {
            stderr.push(text);
          }
        });
        child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) return resolve();
          reject(new Error(workerError || stderr.join("\n").trim() || `SharePoint 上传脚本退出码：${code}`));
        });
      });
    } finally {
      await fs.promises.rm(manifestPath, { force: true }).catch(() => {});
    }

    if (!finalResult) throw new Error("SharePoint 上传脚本没有返回执行结果。");
    const result = { ...finalResult, plan: publicPlan(plan) };
    if (Number(result.failedCount || 0) > 0) {
      const error = new Error(`SharePoint 归档部分失败：成功 ${result.successCount || 0}，失败 ${result.failedCount}。`);
      error.partialResult = result;
      throw error;
    }
    logLine(logs, `SharePoint 归档完成：已上传并验证 ${result.successCount || 0} 个文件。`);
    return result;
  }

  return { execute };
}

module.exports = { createSharePointArchive, publicPlan };
