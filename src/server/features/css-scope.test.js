const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractHtmlClassNames,
  pruneInlineStyleTags,
  pruneUnusedCssClasses,
  scopeCss
} = require("../../../办公软件/111/src/css-scope.js");

test("prefixes normal selectors and selector lists", () => {
  const input = ".card, .button:hover { color: red; }";
  const result = scopeCss(input);

  assert.match(result, /\.page\.page-webflow \.card/);
  assert.match(result, /\.page\.page-webflow \.button:hover/);
});

test("moves root declarations onto the scope element", () => {
  const result = scopeCss(":root { --brand: #167be6; }");
  assert.equal(result, ".page.page-webflow{ --brand: #167be6; }");
});

test("prefixes rules inside grouping at-rules", () => {
  const input = "@media (max-width: 767px) { .card { width: 100%; } }";
  const result = scopeCss(input);

  assert.match(result, /@media \(max-width: 767px\)\s*\{\s*\.page\.page-webflow \.card/);
});

test("does not prefix keyframe steps or font-face declarations", () => {
  const input = [
    "@font-face { font-family: Demo; src: url(demo.woff2); }",
    "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }",
    ".card { animation: fade 1s; }"
  ].join("\n");
  const result = scopeCss(input);

  assert.match(result, /@font-face\{ font-family: Demo;/);
  assert.match(result, /@keyframes fade\{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  assert.doesNotMatch(result, /\.page\.page-webflow from/);
  assert.match(result, /\.page\.page-webflow \.card/);
});

test("does not add the same scope twice", () => {
  const input = ".page.page-webflow .card { color: blue; }";
  const result = scopeCss(input);

  assert.equal((result.match(/\.page\.page-webflow/g) || []).length, 1);
  assert.doesNotMatch(result, /\.page\.page-webflow \.page\.page-webflow/);
});

test("extracts class names from html", () => {
  const classNames = extractHtmlClassNames('<section class="hero card"><div class="card active"></div></section>');

  assert.deepEqual([...classNames].sort(), ["active", "card", "hero"]);
});

test("prunes unused class selectors while keeping used selector list items", () => {
  const result = pruneUnusedCssClasses(
    ".card, .unused:hover { color: red; }\n#root { color: blue; }\n.unused-only { color: gray; }",
    '<div class="card"></div>'
  );

  assert.match(result.css, /\.card\{ color: red; \}/);
  assert.match(result.css, /#root\{ color: blue; \}/);
  assert.doesNotMatch(result.css, /unused/);
  assert.equal(result.removedSelectorCount, 2);
  assert.equal(result.removedRuleCount, 1);
});

test("prunes unused class selectors inside grouping at-rules", () => {
  const result = pruneUnusedCssClasses(
    "@media (max-width: 767px) { .used { width: 100%; } .missing { width: 50%; } }",
    '<div class="used"></div>'
  );

  assert.match(result.css, /@media \(max-width: 767px\)\s*\{\s*\.used/);
  assert.doesNotMatch(result.css, /missing/);
});

test("keeps default webflow dynamic classes even when absent from html", () => {
  const result = pruneUnusedCssClasses(
    ".w-nav-button.w--open { color: white; }\n.custom-missing { color: red; }",
    "<nav></nav>"
  );

  assert.match(result.css, /\.w-nav-button\.w--open/);
  assert.doesNotMatch(result.css, /custom-missing/);
});

test("prunes unused class selectors from inline html style tags", () => {
  const result = pruneInlineStyleTags(
    '<html><head><style>.used { color: green; } .missing { color: red; }</style></head><body><div class="used"></div></body></html>'
  );

  assert.equal(result.styleBlockCount, 1);
  assert.match(result.html, /\.used\s*\{ color: green; \}/);
  assert.doesNotMatch(result.html, /missing/);
  assert.equal(result.removedRuleCount, 1);
});
