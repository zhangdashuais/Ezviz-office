const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  extractSpecificationImage,
  parseSpecificationWorkbook,
  resolveWorkbookLanguage,
  buildPcSpecificationHtml,
  readDetailFromPcView,
  revisionPreviewStatus,
  normalizeInternationalImageUrl,
  internationalListSource,
  validateRevisionRequest,
  resolveProductDescription,
  findSpecificationDetailField,
  productSnapshotStabilitySignature,
  specificationTitleForSite
} = require("./product-revision-sync");

test("reads both singular and plural Specification custom field names", () => {
  const singular = readDetailFromPcView({
    summary: "Overview",
    customs: [{ name: "Specification", value: "Singular content" }]
  });
  assert.equal(singular.specificationsFound, true);
  assert.equal(singular.specifications, "Singular content");
  assert.equal(singular.specificationsFieldName, "Specification");

  const plural = readDetailFromPcView({
    customs: [
      { name: "Specification", value: "Singular content" },
      { name: "Specifications", value: "Plural content" }
    ]
  });
  assert.equal(plural.specifications, "Plural content");
  assert.equal(plural.specificationsFieldName, "Specifications");
});

test("reads the exact Japanese Specification custom field name", () => {
  const field = findSpecificationDetailField([
    { name: "概要", value: "Overview" },
    { name: "\u4ed5\u69d8", value: "Japanese specifications" }
  ]);
  assert.equal(field.name, "\u4ed5\u69d8");
  assert.equal(field.value, "Japanese specifications");
});

test("product snapshot stability changes when asynchronously loaded Detail changes", () => {
  const first = {
    goodsId: "1",
    pcView: { summary: "Overview", customs: [{ name: "仕様", value: "Old" }] },
    basic: { summary: "Description", isSearchable: true, whenType: 0 }
  };
  const second = JSON.parse(JSON.stringify(first));
  assert.equal(
    productSnapshotStabilitySignature(first),
    productSnapshotStabilitySignature(second)
  );
  second.pcView.customs[0].value = "Loaded";
  assert.notEqual(
    productSnapshotStabilitySignature(first),
    productSnapshotStabilitySignature(second)
  );
});

test("product publishing remains executable when copied content needs no later edits", () => {
  assert.equal(revisionPreviewStatus({
    publishing: true,
    detailChanged: false,
    specificationChanged: false,
    descriptionChanged: false,
    languagePackageChanged: false
  }), "ready");
  assert.equal(revisionPreviewStatus({
    publishing: false,
    detailChanged: false,
    specificationChanged: false,
    descriptionChanged: false,
    languagePackageChanged: false
  }), "no-change");
});

test("international list metadata provides a stable pre-copy source fingerprint", () => {
  assert.equal(
    normalizeInternationalImageUrl("//mfs.ezvizlife.com/s10.png"),
    "https://mfs.ezvizlife.com/s10.png"
  );
  const first = internationalListSource("S10", {
    goodsId: "68505",
    brief: "Robot Vacuum & Mop Combo",
    imageUrl: "//mfs.ezvizlife.com/s10.png"
  });
  const second = internationalListSource("S10", {
    goodsId: "68505",
    brief: "Robot Vacuum & Mop Combo",
    imageUrl: "//mfs.ezvizlife.com/s10.png"
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.snapshot.goodsId, "68505");
  assert.equal(first.image.src, "https://mfs.ezvizlife.com/s10.png");
});

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

test("reads a lazy-loaded Specification image address", () => {
  const image = extractSpecificationImage(
    '<img class="pro-img__src" data-src="https://example.com/specification.jpg" alt="Specification">'
  );
  assert.equal(image.src, "https://example.com/specification.jpg");
  assert.equal(image.alt, "Specification");
});

test("skips an empty preferred image placeholder when another image has an address", () => {
  const image = extractSpecificationImage([
    '<img class="pro-img__src" alt="Empty placeholder">',
    '<img src="https://example.com/fallback.jpg" alt="Fallback">'
  ].join(""));
  assert.equal(image.src, "https://example.com/fallback.jpg");
  assert.equal(image.alt, "Fallback");
});

test("keeps a source Specification with an empty image placeholder image-free", () => {
  const image = extractSpecificationImage('<img class="pro-img__src" alt="No image">');
  assert.equal(image.src, "");
  assert.equal(image.emptyPlaceholder, true);
  const parsed = parseSpecificationWorkbook(workbookBuffer());
  const html = buildPcSpecificationHtml(parsed.languages[0], image);
  assert.doesNotMatch(html, /<img\b/i);
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

test("maps the Specification title to the selected target site", () => {
  assert.equal(specificationTitleForSite("la"), "Especificaciones");
  assert.equal(specificationTitleForSite("br"), "Especificações");
  assert.equal(specificationTitleForSite("jp"), "仕様");
  assert.equal(specificationTitleForSite("de"), "Technische Daten");
  assert.equal(specificationTitleForSite("sa"), "المواصفات");
  assert.equal(specificationTitleForSite("unknown", "Workbook title"), "Workbook title");
});

test("uses a target-site title override in Detail Specification HTML", () => {
  const parsed = parseSpecificationWorkbook(workbookBuffer());
  const english = resolveWorkbookLanguage(parsed, { siteCode: "hq" });
  const html = buildPcSpecificationHtml(english, null, specificationTitleForSite("la"));
  assert.match(html, /<div class="pro-title">Especificaciones<\/div>/);
  assert.doesNotMatch(html, /<div class="pro-title">Specifications<\/div>/);
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

test("product publishing may preserve the target site's international copy source description", () => {
  const parsed = {
    headers: ["Vietnamese"],
    rows: [{
      key: "product_title",
      source: "Smart camera",
      translations: { Vietnamese: "Camera thông minh" }
    }]
  };
  const result = resolveProductDescription(parsed, { siteCode: "vn" }, {
    fallbackDescription: "International source description"
  });
  assert.equal(result.description, "International source description");
  assert.equal(result.inherited, true);
  assert.equal(result.translationHeader, "国际产品复制源");
});

test("product revision may preserve the current target description when Datasheet omits it", () => {
  const result = resolveProductDescription({ headers: ["Japanese"], rows: [] }, {
    siteCode: "jp",
    languagePackageHeader: "Japanese"
  }, { fallbackDescription: "Existing JP product description" });
  assert.equal(result.description, "Existing JP product description");
  assert.equal(result.inherited, true);
});

test("product publishing ignores the legacy source-site selection", () => {
  const sites = [
    { siteCode: "hq", name: "Global" },
    { siteCode: "vn", name: "Viet Nam" }
  ];
  const request = validateRevisionRequest({
    productName: "CB90f Triple Kit",
    sourceSiteCode: "hq",
    targetsJson: JSON.stringify([{ siteCode: "hq" }, { siteCode: "vn" }])
  }, sites, { ignoreSourceSite: true });
  assert.equal(request.sourceSite, null);
  assert.deepEqual(request.targets.map((target) => target.siteCode), ["hq", "vn"]);
});
