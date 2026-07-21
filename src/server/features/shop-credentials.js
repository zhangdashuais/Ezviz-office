const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createShopCredentials(options = {}) {
  const desktopRoot = options.desktopRoot;
  const backendRoot = options.backendRoot;
  const additionalRoots = options.additionalRoots || [];
  const workbookNames = options.workbookNames || ["网站账号密码", "账号密码"];

  function findWorkbook() {
    const roots = [desktopRoot, process.env.EZVIZ_CREDENTIAL_DIR, backendRoot, ...additionalRoots]
      .filter((dir, index, list) => dir && list.indexOf(dir) === index && fs.existsSync(dir));
    const candidates = [];
    const ignored = new Set(["node_modules", ".git", "outputs", ".playwright", ".playwright-cli", "runtime_uploads"]);
    function walk(dir, depth = 0) {
      if (depth > 4) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (!ignored.has(item.name)) walk(full, depth + 1);
        } else if (item.isFile() && item.name.endsWith(".xlsx") && !item.name.startsWith("~$")) {
          const stat = fs.statSync(full);
          const named = workbookNames.some((name) => item.name.includes(name) || full.includes(name));
          if (named || stat.size === 23744) candidates.push({ full, size: stat.size, named });
        }
      }
    }
    roots.forEach((root) => walk(root));
    return candidates.find((item) => item.named && item.full.startsWith(desktopRoot))?.full
      || candidates.find((item) => item.size === 23744 && item.full.startsWith(desktopRoot))?.full
      || candidates.find((item) => item.named)?.full
      || candidates.find((item) => item.size === 23744)?.full
      || (() => { throw new Error("没有找到网站账号密码 Excel 表，请放在桌面，或设置 EZVIZ_CREDENTIAL_DIR 指向账号表所在文件夹。"); })();
  }

  function entries(buffer) {
    const result = new Map();
    let pos = 0;
    while (pos < buffer.length - 4) {
      if (buffer.readUInt32LE(pos) !== 0x04034b50) { pos += 1; continue; }
      const method = buffer.readUInt16LE(pos + 8);
      const size = buffer.readUInt32LE(pos + 18);
      const nameLength = buffer.readUInt16LE(pos + 26);
      const extraLength = buffer.readUInt16LE(pos + 28);
      const name = buffer.slice(pos + 30, pos + 30 + nameLength).toString("utf8");
      const start = pos + 30 + nameLength + extraLength;
      const raw = buffer.slice(start, start + size);
      result.set(name, method === 8 ? zlib.inflateRawSync(raw).toString("utf8") : raw.toString("utf8"));
      pos = start + size;
    }
    return result;
  }
  const decode = (value = "") => value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  function sharedStrings(xml = "") {
    return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) =>
      [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decode(item[1])).join(""));
  }
  function columnIndex(ref) {
    let index = 0;
    for (const letter of (ref.match(/[A-Z]+/)?.[0] || "A")) index = index * 26 + letter.charCodeAt(0) - 64;
    return index - 1;
  }
  function rows(xml, shared) {
    const result = [];
    for (const rowMatch of String(xml || "").matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/c>)/g)) {
        const ref = cell[1].match(/\br="([A-Z]+\d+)"/)?.[1];
        if (!ref) continue;
        const type = cell[1].match(/\bt="([^"]+)"/)?.[1];
        const content = cell[2] || "";
        let value = content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        if (type === "s") value = shared[Number(value)] ?? "";
        if (type === "inlineStr") value = [...content.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decode(item[1])).join("");
        row[columnIndex(ref)] = decode(value).trim();
      }
      result[Number(rowMatch[1]) - 1] = row;
    }
    return result;
  }

  function read(targetGroup, targetDomain) {
    const workbookPath = findWorkbook();
    const archive = entries(fs.readFileSync(workbookPath));
    const data = rows(archive.get("xl/worksheets/sheet1.xml"), sharedStrings(archive.get("xl/sharedStrings.xml")));
    let group = "";
    let inheritedDomain = "";
    let matchedDomain = false;
    const expectedGroup = String(targetGroup || "Website").toLowerCase();
    for (const row of data) {
      const domain = row?.[0] || "";
      if (!domain.includes(".") && !/^domain$/i.test(domain) && !row[1] && !row[2]) {
        if (domain) group = domain;
        inheritedDomain = "";
        continue;
      }
      if (domain) inheritedDomain = domain;
      const effectiveDomain = domain || inheritedDomain;
      if (!effectiveDomain) continue;
      const currentGroup = group.toLowerCase();
      const defaultWebsite = ["website", "main", "regular", "default"].includes(expectedGroup) && currentGroup === "";
      if (effectiveDomain === targetDomain && (currentGroup === expectedGroup || defaultWebsite)) {
        matchedDomain = true;
        if (!row[1] || !row[2]) continue;
        return { account: row[1], password: row[2], workbookPath };
      }
    }
    if (matchedDomain) throw new Error(`账号密码表中 ${targetDomain} 的账号或密码为空。`);
    throw new Error(`账号密码表里没有找到 ${targetGroup || "Website"} / ${targetDomain}。`);
  }

  function domainForSite(site) {
    if (!site || site.siteCode === "hq") return "www.ezviz.com";
    try {
      const parsed = new URL(site.url);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      return parsed.hostname + (pathname && pathname !== "/inter" ? pathname : "");
    } catch { return "www.ezviz.com"; }
  }

  return {
    findWorkbook,
    read,
    domainForSite,
    zipEntries: entries,
    sharedStrings,
    readRows: rows
  };
}

module.exports = { createShopCredentials };
