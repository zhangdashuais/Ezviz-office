const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeComparableText,
  textSimilarity,
  extractFacts,
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

test("comparison separates matches, changes, missing and HTML-only text", () => {
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
      { tag: "h1", text: "Triple 3K Lenses" },
      { tag: "p", text: "Up to 10x Mixed Zoom" },
      { tag: "p", text: "Only available in selected markets" }
    ]
  });

  assert.equal(result.summary.match, 1);
  assert.equal(result.summary.changed, 1);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.extra, 1);
  assert.equal(result.summary.critical, 2);
  assert.equal(result.summary.verdict, "fail");
  assert.equal(result.summary.differenceCount, 3);
  assert.match(result.recommendations[0].message, /数值或单位风险/);
  assert.equal(
    result.items.find((item) => item.type === "changed").critical,
    true
  );
  assert.match(
    result.items.find((item) => item.type === "changed").suggestion,
    /高优先级/
  );
});
