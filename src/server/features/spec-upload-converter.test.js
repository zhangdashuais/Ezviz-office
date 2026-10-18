const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XLSX = require("xlsx");
const rules = require("../../../办公软件/111/src/language-column-filter-rules");
const { parseSpecificationWorkbook, buildPcSpecificationHtml } = require("./product-revision-sync");

const script = fs.readFileSync(
  path.resolve(__dirname, "../../../办公软件/111/src/module-spec-upload.js"),
  "utf8"
);

function fixture() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["English", "", "German", ""],
    ["OK", "", "OK", ""],
    ["Specifications", "", "Spezifikationen", ""],
    ["Model", "CS-HP8", "Modell", "CS-HP8"],
    ["Camera Parameters", "", "Kameraparameter", ""],
    ["Lens", "2.3 mm", "Linse", "2,3 mm"]
  ]);
  sheet["!merges"] = [1, 2, 4].flatMap((row) => [0, 2].map((col) => ({
    s: { r: row, c: col }, e: { r: row, c: col + 1 }
  })));
  sheet.D3 = { t: "s", v: "covered duplicate" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Specifications");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function createUi(buffer) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", files: [], options: [], disabled: false,
      handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; },
      appendChild(item) { this.options.push(item); },
      set innerHTML(value) { this._innerHTML = value; if (id === "specLangSelect") this.options = []; },
      get innerHTML() { return this._innerHTML || ""; }
    });
    return elements.get(id);
  };
  get("specFileInput").files = [{ name: "HP8.xlsx", buffer: Uint8Array.from(buffer) }];
  get("specTitleInput").value = "Spezifikationen";
  get("specImageSrcInput").value = "https://example.com/hp8.png";
  get("specImageAltInput").value = "image";
  const clipboard = { value: "", async writeText(value) { this.value = value; } };
  class FileReader {
    readAsArrayBuffer(file) { this.onload({ target: { result: file.buffer } }); }
  }
  vm.runInNewContext(script, {
    window: { XLSX, languageColumnFilterRules: rules },
    document: { getElementById: get, createElement: () => ({ value: "", textContent: "" }) },
    FileReader,
    navigator: { clipboard },
    console
  });
  return { get, clipboard };
}

test("independent Spec converter matches product-upload PC structure and skips OK/covered cells", async () => {
  const buffer = fixture();
  const { get, clipboard } = createUi(buffer);
  await get("specFileInput").handlers.change();
  assert.deepEqual(get("specLangSelect").options.map((option) => option.textContent), ["English", "German"]);
  get("specLangSelect").value = "1";
  get("specGenerateBtn").handlers.click();

  const pcHtml = get("specPcOutput").value;
  const mobileHtml = get("specMobileOutput").value;
  const parsed = parseSpecificationWorkbook(buffer);
  const expected = buildPcSpecificationHtml(parsed.languages[1], {
    src: "https://example.com/hp8.png", alt: "image"
  }, "Spezifikationen");
  assert.equal(pcHtml, expected);
  assert.doesNotMatch(pcHtml, />OK<|covered duplicate|pc-content|<style>|<tr class="line">/);
  assert.doesNotMatch(mobileHtml, />OK<|covered duplicate/);
  assert.match(pcHtml, /<tr class="firstRow"><th class="title"/);
  assert.match(pcHtml, /<tr><th class="title"[^>]*>Kameraparameter<\/th><\/tr>/);
  await get("specCopyPcBtn").handlers.click();
  assert.equal(clipboard.value, pcHtml);
  await get("specCopyMobileBtn").handlers.click();
  assert.equal(clipboard.value, mobileHtml);
  assert.doesNotMatch(clipboard.value, /<style>/);
});
