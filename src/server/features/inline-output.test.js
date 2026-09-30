const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeNumberedClasses,
  appendRequiredCss,
  requiredListItemStyleValue,
  wrap
} = require("../../../办公软件/111/src/inline-output.js");

test("always appends the required medium emphasis rule", () => {
  assert.equal(
    appendRequiredCss(".title { color: red; }"),
    ".title { color: red; }\n\nb, strong {\n  font-weight: medium;\n}"
  );
});

test("uses the required decimal list-item style", () => {
  assert.equal(requiredListItemStyleValue(), "list-style: decimal;");
});

test("wraps inline output with optional head and body tags", () => {
  const fragment = '<div class="page page-webflow">Detail</div>';
  const link = '<link rel="stylesheet" href="webflow.css">';

  assert.equal(wrap(fragment, link), `<!-- product detail webflow -->\n${fragment}`);
  assert.equal(
    wrap(fragment, link, { includeHead: true, includeBody: true }),
    `<head>\n${link}\n</head>\n<body>\n<!-- product detail webflow -->\n${fragment}\n</body>`
  );
});

test("merges numbered classes only when their selector and declaration signatures match", () => {
  const result = normalizeNumberedClasses(
    '<div class="normal-7 u-text-left"></div><div class="normal u-text-left"></div>',
    '.normal-7.u-text-left { color: red; } .normal.u-text-left { color: red; }'
  );

  assert.equal(result.html, '<div class="normal u-text-left"></div><div class="normal u-text-left"></div>');
  assert.equal(result.css, '.normal.u-text-left { color: red; } .normal.u-text-left { color: red; }');
  assert.deepEqual(result.replacements, { "normal-7": "normal" });
});

test("preserves numbered classes when combinations have different styles", () => {
  const result = normalizeNumberedClasses(
    '<div class="normal-7 u-text-left"></div><div class="normal u-text-left"></div>',
    '.normal-7.u-text-left { color: red; } .normal.u-text-left { color: blue; }'
  );

  assert.equal(result.html, '<div class="normal-7 u-text-left"></div><div class="normal u-text-left"></div>');
  assert.equal(result.css, '.normal-7.u-text-left { color: red; } .normal.u-text-left { color: blue; }');
  assert.deepEqual(result.replacements, {});
});

test("preserves numbered classes when breakpoint rules differ", () => {
  const result = normalizeNumberedClasses(
    '<div class="normal-7"></div><div class="normal"></div>',
    '.normal-7 { color: red; } .normal { color: red; } @media (max-width: 767px) { .normal-7 { color: blue; } }'
  );

  assert.deepEqual(result.replacements, {});
});
