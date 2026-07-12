const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { runRandomSiteAudit } = require("../src/server/features/ezviz-site-audit/random-site-audit");

function readSampleSize(argv) {
  const index = argv.indexOf("--sample-size");
  const value = index >= 0 ? Number(argv[index + 1]) : 5;
  return Math.min(20, Math.max(1, value || 5));
}

async function main() {
  const sampleSize = readSampleSize(process.argv.slice(2));
  const report = await runRandomSiteAudit({
    chromium,
    sampleSize,
    onProgress(progress) {
      process.stdout.write(`${new Date().toISOString()} ${JSON.stringify(progress)}\n`);
    }
  });

  const outputDirectory = path.join(__dirname, "..", "runtime_uploads", "ezviz-site-audit");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputDirectory, `ezviz-site-audit-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`REPORT_PATH=${reportPath}\n`);
  process.stdout.write(`SITES=${report.sites.length}\n`);
  process.stdout.write(`ISSUES=${report.issueCount}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
