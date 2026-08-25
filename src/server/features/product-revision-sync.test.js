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
  isSpecificationLanguageOnly,
  effectiveProductDescriptionForScope,
  normalizeInternationalImageUrl,
  internationalListSource,
  validateRevisionRequest,
  validateDirectRevision,
  applyContentOperations,
  applySpecificationOperations,
  buildCommonRevisionTargets,
  resolveProductDescription,
  findSpecificationDetailField,
  productSnapshotStabilitySignature,
  retryProductReadback,
  specificationTitleForSite
} = require("./product-revision-sync");

test("Specification and language-only scope preserves unrelated product content", () => {
  assert.equal(isSpecificationLanguageOnly({ updateScope: "specification-language" }), true);
  assert.equal(isSpecificationLanguageOnly({}), false);
});

test("Specification and language-only scope updates Product Description when Datasheet provides it", () => {
  assert.equal(effectiveProductDescriptionForScope(true, "Old description", {
    description: "Nieuwe beschrijving"
  }), "Nieuwe beschrijving");
  assert.equal(effectiveProductDescriptionForScope(true, "Old description", {
    description: "Old description",
    inherited: true
  }), "Old description");
});

test("common product revision expands multiple countries and products into independent targets", () => {
  const result = buildCommonRevisionTargets({
    sites: ["de", "fr", "de"],
    productNames: "CP8\nH9c"
  }, [
    { siteCode: "de", name: "Germany" },
    { siteCode: "fr", name: "France" },
    { siteCode: "it", name: "Italy", enabled: false }
  ]);
  assert.deepEqual(result.targets.map(({ site, productName }) => `${site.siteCode}:${productName}`), [
    "de:CP8", "de:H9c", "fr:CP8", "fr:H9c"
  ]);
});

test("retries stale product readback without resubmitting the save", async () => {
  let reads = 0;
  let waits = 0;
  const result = await retryProductReadback(
    async () => ({ detail: reads++ ? "new" : "old" }),
    (snapshot) => ({ passed: snapshot.detail === "new" }),
    { wait: async () => { waits += 1; } }
  );
  assert.equal(result.snapshot.detail, "new");
  assert.equal(result.attempt, 2);
  assert.equal(reads, 2);
  assert.equal(waits, 1);
});

test("direct product revision validates Detail and applies delete/replace operations", () => {
  const request = validateDirectRevision({
    revisionType: "specification",
    siteCode: "de",
    productName: "CP8",
    detailHtml: "<section>new detail</section>",
    specificationOperations: [
      { type: "delete", targetText: "REMOVE" },
      { type: "replace", targetText: "OLD", replacementText: "NEW" }
    ]
  });
  assert.equal(request.productName, "CP8");
  const result = applySpecificationOperations("A REMOVE B OLD", request.operations);
  assert.equal(result.value, "A  B NEW");
  assert.deepEqual(result.results.map((item) => item.matchCount), [1, 1]);
});

test("Specification frame-rate deletion preserves the site's remaining text", () => {
  const request = validateDirectRevision({
    revisionType: "specification",
    siteCode: "de",
    productName: "H1c",
    specificationOperations: [{ type: "delete-frame-rate" }]
  });
  const result = applySpecificationOperations(
    "<td>Max:25fps; Selbstanpassend bei Netzwerkübertragung</td>"
      + "<td>Max. 15 fps；テキスト</td>",
    request.operations
  );
  assert.equal(result.value, "<td>Selbstanpassend bei Netzwerkübertragung</td><td>テキスト</td>");
  assert.equal(result.results[0].matchCount, 2);
  assert.throws(() => validateDirectRevision({
    revisionType: "detail",
    siteCode: "de",
    productName: "H1c",
    detailOperations: [{ type: "delete-frame-rate" }]
  }), /只允许用于 Specification/);
});

test("Detail and Specification direct revisions validate independently", () => {
  const detail = validateDirectRevision({
    revisionType: "detail", siteCode: "de", productName: "CP8", detailHtml: "<main>new</main>"
  });
  assert.equal(detail.revisionType, "detail");
  assert.deepEqual(detail.operations, []);
  const specification = validateDirectRevision({
    revisionType: "specification", siteCode: "de", productName: "CP8",
    specificationOperations: [{ type: "delete", targetText: "obsolete" }]
  });
  assert.equal(specification.revisionType, "specification");
  assert.equal(specification.detailHtml, "");
});

test("direct product revision allows Product Description only", () => {
  const request = validateDirectRevision({
    revisionType: "detail",
    siteCode: "nl",
    productName: "CP8",
    productDescription: "Slimme beveiliging"
  });
  assert.equal(request.productDescriptionProvided, true);
  assert.equal(request.productDescription, "Slimme beveiliging");
  assert.deepEqual(request.operations, []);
});

test("direct product revision allows Specification custom field name only", () => {
  const request = validateDirectRevision({
    revisionType: "specification",
    siteCode: "fr",
    productName: "H8c Bundle (4PK)",
    specificationFieldName: "Spécifications"
  });
  assert.equal(request.specificationFieldNameProvided, true);
  assert.equal(request.specificationFieldName, "Spécifications");
  assert.deepEqual(request.operations, []);
});

test("different products can share one exact Detail operation", () => {
  const request = validateDirectRevision({
    revisionType: "detail",
    siteCode: "de",
    productName: "CP8",
    detailOperations: [{ type: "replace", targetText: "OLD BLOCK", replacementText: "NEW BLOCK" }]
  });
  const result = applyContentOperations("before OLD BLOCK after", request.operations, "Detail");

  assert.equal(request.detailHtml, "");
  assert.equal(result.value, "before NEW BLOCK after");
  assert.equal(result.results[0].matchCount, 1);
});

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

test("reads the legacy Specs custom field name", () => {
  const field = findSpecificationDetailField([
    { name: "Overview", value: "Overview" },
    { name: "Specs", value: "Legacy specifications" }
  ]);
  assert.equal(field.name, "Specs");
  assert.equal(field.value, "Legacy specifications");
});

test("reads a localized Specification custom field name", () => {
  const field = findSpecificationDetailField([
    { name: "Resumen", value: "Resumen" },
    { name: "Especificaciones", value: "Max: 25fps; texto local" }
  ]);
  assert.equal(field.name, "Especificaciones");
});

test("reads localized singular Specification custom field names", () => {
  const spanish = findSpecificationDetailField([
    { name: "Resumen", value: "Resumen" },
    { name: "Especificación", value: "Máx. 25 fps; texto local" }
  ]);
  assert.equal(spanish.name, "Especificación");
  const spanishTypo = findSpecificationDetailField([
    { name: "Resumen", value: "Resumen" },
    { name: "Especificaiones", value: "Máx. 25 fps; texto local" }
  ]);
  assert.equal(spanishTypo.name, "Especificaiones");
  const portuguese = findSpecificationDetailField([
    { name: "Resumo", value: "Resumo" },
    { name: "Especificação", value: "Máx.: 25 fps; texto local" }
  ]);
  assert.equal(portuguese.name, "Especificação");
  const thai = findSpecificationDetailField([
    { name: "ภาพรวม", value: "ภาพรวม" },
    { name: "รายละเอียด", value: "สูงสุด 25 fps; ข้อความท้องถิ่น" }
  ]);
  assert.equal(thai.name, "รายละเอียด");
});

test("falls back to the only custom field containing a Max fps fragment", () => {
  const field = findSpecificationDetailField([
    { name: "未知字段", value: "普通内容" },
    { name: "本地规格标题", value: "Max: 15fps；保留本地文字" }
  ]);
  assert.equal(field.name, "本地规格标题");
});

test("Specification frame-rate deletion handles localized max labels", () => {
  const result = applySpecificationOperations(
    "<td>Máx. 25 fps; texto local</td>"
      + "<td>最大：30 fps；保留本地文字</td>"
      + "<td>Макс. 15 fps; локальный текст</td>",
    [{ type: "delete-frame-rate" }]
  );
  assert.equal(result.results[0].matchCount, 3);
  assert.equal(
    result.value,
    "<td>texto local</td><td>保留本地文字</td><td>локальный текст</td>"
  );
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
  assert.equal(specificationTitleForSite("de"), "Spezifikationen");
  assert.equal(specificationTitleForSite("fr"), "Spécifications");
  assert.equal(specificationTitleForSite("nl"), "Specificaties");
  assert.equal(specificationTitleForSite("it"), "Specifiche");
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

test("product revision can infer Product Description from the current backend text", () => {
  const parsedDatasheet = {
    headers: ["Dutch"],
    rows: [{
      key: "CP8_4",
      source: "Smart protection made simple",
      rowNumber: 4,
      translations: { Dutch: "Slimme bescherming, eenvoudig gemaakt" }
    }]
  };
  const result = resolveProductDescription(parsedDatasheet, {
    siteCode: "nl",
    languagePackageHeader: "Dutch"
  }, {
    currentDescription: "Smart protection made simple",
    fallbackDescription: "Smart protection made simple"
  });
  assert.equal(result.description, "Slimme bescherming, eenvoudig gemaakt");
  assert.equal(result.inferredFromCurrentDescription, true);
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
