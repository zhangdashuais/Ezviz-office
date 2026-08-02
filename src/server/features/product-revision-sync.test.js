const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  extractSpecificationImage,
  parseSpecificationWorkbook,
  resolveWorkbookLanguage,
  buildPcSpecificationHtml,
  validateRevisionRequest,
  resolveProductDescription
} = require("./product-revision-sync");

function workbookBuffer() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["1_English (English-英文)", "", "11_Français (France-法语)", ""],
    ["Specifications", "", "Caractéristiques", ""],
    ["Model", "CS-TEST", "Modèle", "CS-TEST"],
    ["Network", "", "Réseau", ""],
    ["Wi-Fi", "2.4 GHz", "Wi-Fi", "2,4 GHz"]
  ]);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Spec");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("reads the preferred Specification image src and alt from international HTML", () => {
  const image = extractSpecificationImage([
    '<img src="ignored.jpg" alt="Ignored">',
    '<img class="hero pro-img__src active" src="https://cdn.example/spec?a=1&amp;b=2" alt="A &amp; B">'
  ].join(""));
  assert.deepEqual(image, {
    src: "https://cdn.example/spec?a=1&b=2",
    alt: "A & B"
  });
});

test("parses paired language columns and generates Specification HTML", () => {
  const parsed = parseSpecificationWorkbook(workbookBuffer());
  assert.equal(parsed.languages.length, 2);
  const french = resolveWorkbookLanguage(parsed, { siteCode: "fr" });
  assert.equal(french.title, "Caractéristiques");
  const html = buildPcSpecificationHtml(french, {
    src: "https://cdn.example/spec.jpg",
    alt: 'Caméra "Pro"'
  });
  assert.match(html, /Caractéristiques/);
  assert.match(html, /2,4 GHz/);
  assert.match(html, /src="https:\/\/cdn\.example\/spec\.jpg"/);
  assert.match(html, /alt="Caméra &quot;Pro&quot;"/);
  assert.match(html, /word-break: normal/);
});

test("requires explicit target mappings only when auto matching is unavailable", () => {
  const parsed = parseSpecificationWorkbook(workbookBuffer());
  assert.equal(
    resolveWorkbookLanguage(parsed, {
      siteCode: "custom",
      localeHeader: "11_Français (France-法语)"
    }).title,
    "Caractéristiques"
  );
  assert.throws(
    () => resolveWorkbookLanguage(parsed, { siteCode: "custom" }),
    /没有自动匹配/
  );
});

test("validates source and target sites for product revision sync", () => {
  const sites = [
    { siteCode: "hq", name: "Global" },
    { siteCode: "fr", name: "France" },
    { siteCode: "de", name: "Germany" }
  ];
  const request = validateRevisionRequest({
    productName: "CP8",
    sourceSiteCode: "hq",
    targetsJson: JSON.stringify([
      { siteCode: "fr", localeHeader: "11_Français (France-法语)" },
      { siteCode: "de", localeHeader: "3_Deutsch (German-德语)" }
    ])
  }, sites);
  assert.equal(request.productName, "CP8");
  assert.equal(request.targets.length, 2);
  assert.equal(request.targets[0].site.name, "France");
  assert.equal(request.targets[1].site.name, "Germany");
  assert.throws(
    () => validateRevisionRequest({
      productName: "CP8",
      sourceSiteCode: "hq",
      targets: [{ siteCode: "hq" }]
    }, sites),
    /不能与源站点相同/
  );
});

test("resolves Product Description from the target Datasheet language", () => {
  const parsedDatasheet = {
    headers: ["English", "French"],
    rows: [{
      key: "Product Description",
      source: "Clearer views",
      rowNumber: 2,
      translations: { English: "Clearer views", French: "Une vision plus claire" }
    }]
  };
  const result = resolveProductDescription(parsedDatasheet, {
    siteCode: "fr",
    languagePackageHeader: "French"
  });
  assert.equal(result.description, "Une vision plus claire");
  assert.equal(result.translationHeader, "French");
});
