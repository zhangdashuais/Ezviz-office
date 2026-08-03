const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
