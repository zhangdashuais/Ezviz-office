const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeComparableText,
  textSimilarity,
  extractFacts,
  isSpecificationPage,
  htmlContainsPdfText,
  compareTextContent
} = require("./text-comparison");

test("normalization ignores common PDF typography and unit spacing", () => {
  assert.equal(
    normalizeComparableText("Up to 12 × Mixed Zoom — 2.8 mm"),
    normalizeComparableText("up to 12 x mixed zoom - 2.8mm")
  );
  assert.equal(normalizeComparableText("ﬁeld of view"), "field of view");
});

test("similarity recognizes small copy edits", () => {
  const score = textSimilarity(
    "Supports Local Storage (Up to 512 GB)",
    "Supports local storage up to 512GB"
  );
  assert.ok(score >= 0.82, `unexpected score: ${score}`);
  const factContainment = textSimilarity("IP65", "IP65 Weather Protection");
  assert.ok(
    factContainment >= 0.48 && factContainment < 0.82,
    `unexpected fact containment score: ${factContainment}`
  );
});

test("numeric facts include units and zoom values", () => {
  assert.deepEqual(
    extractFacts("2.8 mm lens, up to 12x mixed zoom, 8 W and IP65"),
    ["12x", "2.8mm", "8w", "ip65"]
  );
});

test("HTML containment ignores additional HTML copy and only warns for missing PDF fragments", () => {
  const result = compareTextContent({
    pdfPages: [{
      page: 1,
      lines: [
        "Triple 3K Lenses",
        "Up to 12x Mixed Zoom",
        "IP65 Weather Protection"
      ]
    }],
    htmlSegments: [
      { tag: "h1", text: "New CB90 kit with Triple 3K Lenses for wider coverage" },
      { tag: "p", text: "Up to 12x Mixed Zoom with additional product copy" },
      { tag: "p", text: "Only available in selected markets" }
    ]
  });

  assert.equal(result.summary.match, 2);
  assert.equal(result.summary.changed, 0);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.extra, 0);
  assert.equal(result.summary.critical, 1);
  assert.equal(result.summary.verdict, "warning");
  assert.equal(result.summary.differenceCount, 1);
  assert.equal(result.options.mode, "pdf-fragment-contained-in-html");
});

test("containment normalizes case and unit spacing", () => {
  assert.equal(
    htmlContainsPdfText("Up to 12x Mixed Zoom with extra HTML copy", "up to 12 x mixed zoom"),
    true
  );
  assert.equal(htmlContainsPdfText("Up to 10x Mixed Zoom", "Up to 12x Mixed Zoom"), false);
});

test("containment spans adjacent HTML blocks in the same section and reports its position", () => {
  const result = compareTextContent({
    pdfPages: [{
      page: 2,
      lines: ["keeps the camera always on powered by AOV 2.0 technology"]
    }],
    htmlSegments: [
      {
        tag: "p",
        text: "The built-in battery keeps the camera always on",
        section: { index: 2, id: "overview", className: "overview-section", heading: "HB90 Dual Kit" }
      },
      {
        tag: "p",
        text: "powered by AOV 2.0 technology, HB90 Dual records non-stop.",
        section: { index: 2, id: "overview", className: "overview-section", heading: "HB90 Dual Kit" }
      }
    ]
  });
  assert.equal(result.summary.match, 1);
  assert.equal(result.summary.missing, 0);
  assert.match(result.items[0].htmlSection, /Section 2/);
  assert.match(result.items[0].htmlSection, /#overview/);
  assert.match(result.items[0].htmlSection, /块 1-2/);
});

test("containment searches all visible HTML text and reports a cross-section location", () => {
  const result = compareTextContent({
    pdfPages: [{ page: 1, lines: ["first half second half"] }],
    htmlSegments: [
      { tag: "p", text: "first half", section: { index: 1, id: "one", heading: "One" } },
      { tag: "p", text: "second half", section: { index: 2, id: "two", heading: "Two" } }
    ]
  });
  assert.equal(result.summary.match, 1);
  assert.equal(result.summary.missing, 0);
  assert.match(result.items[0].htmlSection, /Section 1/);
  assert.match(result.items[0].htmlSection, /Section 2/);
});

test("short PDF lines split on sentence boundaries before HTML containment", () => {
  const result = compareTextContent({
    pdfPages: [{
      page: 5,
      lines: ["viewing angle. You can pinpoint up to 12 angles via"]
    }],
    htmlSegments: [{
      tag: "p",
      text: "You can pinpoint up to 12 angles via the EZVIZ App."
    }]
  });

  const pinpointItem = result.items.find((item) => item.pdfText.includes("pinpoint"));
  assert.equal(result.summary.match, 1);
  assert.equal(result.summary.missing, 1);
  assert.equal(pinpointItem?.type, "match");
});

test("the Specification heading page and every following PDF page are excluded", () => {
  assert.equal(isSpecificationPage({ lines: ["Specifications CS-HB90", "Lens", "2.8 mm"] }), true);
  assert.equal(isSpecificationPage({ lines: ["In the box", "Specifications are subject to change"] }), false);
  const result = compareTextContent({
    pdfPages: [
      { page: 21, lines: ["Product footnotes"] },
      { page: 22, lines: ["Specifications CS-HB90", "Lens", "2.8 mm"] },
      { page: 24, lines: ["In the box", "Solar Panel 8W"] }
    ],
    htmlSegments: [{ tag: "p", text: "Product footnotes" }]
  });
  assert.equal(result.summary.pdfPages, 1);
  assert.equal(result.summary.pdfSegments, 1);
  assert.equal(result.summary.excludedSpecificationPages, 2);
  assert.equal(result.summary.excludedSpecificationSegments, 5);
  assert.equal(result.summary.missing, 0);
});

test("units match when HTML and PDF split 2.8 and mm in either direction", () => {
  const combinedHtml = compareTextContent({
    pdfPages: [{ page: 1, lines: ["Focal Length 2.8 mm"] }],
    htmlSegments: [
      { tag: "span", text: "Focal Length" },
      { tag: "span", text: "2.8" },
      { tag: "span", text: "mm" }
    ]
  });
  assert.equal(combinedHtml.summary.match, 1);

  const splitPdf = compareTextContent({
    pdfPages: [{ page: 1, lines: ["2.8", "mm"] }],
    htmlSegments: [{ tag: "p", text: "Focal Length 2.8mm" }]
  });
  assert.equal(splitPdf.summary.match, 2);
  assert.equal(splitPdf.summary.missing, 0);
});

test("missing PDF text suggests the closest language package field to update", () => {
  const result = compareTextContent({
    pdfPages: [{ page: 1, lines: ["Up to 12x Mixed Zoom"] }],
    htmlSegments: [{
      tag: "p",
      text: "Up to 10x Mixed Zoom",
      languageKeys: ["goods.zoom_copy"]
    }]
  });

  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.languageFieldSuggestionCount, 1);
  assert.deepEqual(result.items[0].languageFieldSuggestions, [{
    key: "goods.zoom_copy",
    currentText: "Up to 10x Mixed Zoom",
    suggestedText: "Up to 12x Mixed Zoom",
    similarity: result.items[0].languageFieldSuggestions[0].similarity
  }]);
  assert.match(result.items[0].suggestion, /goods\.zoom_copy/);
});
