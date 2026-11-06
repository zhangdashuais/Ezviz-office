const fs = require("fs");
const path = require("path");

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates = [
    path.resolve(path.dirname(process.execPath), "..", "..", "python", "python.exe"),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "python";
}

module.exports = { resolvePython };
