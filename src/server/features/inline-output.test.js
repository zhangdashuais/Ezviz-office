const test = require("node:test");
const assert = require("node:assert/strict");

const { wrap } = require("../../../办公软件/111/src/inline-output.js");

test("wraps inline output with optional head and body tags", () => {
  const fragment = '<div class="page page-webflow">Detail</div>';
  const link = '<link rel="stylesheet" href="webflow.css">';

  assert.equal(wrap(fragment, link), `<!-- product detail webflow -->\n${fragment}`);
  assert.equal(
    wrap(fragment, link, { includeHead: true, includeBody: true }),
    `<head>\n${link}\n</head>\n<body>\n<!-- product detail webflow -->\n${fragment}\n</body>`
  );
});
