const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiBadgeHtml } = require("../../../办公软件/111/src/module-ai-badge");

test("HTML AI badges keep source markup and target every section, not images", () => {
  const source = '<style>.hero{background-image:url(hero.jpg)}</style><div class="product"><section class="hero"><img src="photo.jpg"></section><section>No background</section></div>';
  const output = createAiBadgeHtml(source, "AI GENERATED");
  assert.match(output, /<div data-ezviz-ai-scope="[^"]+" class="product">/);
  assert.match(output, /<section class="hero"><img src="photo.jpg"><\/section><section>No background<\/section>/);
  assert.match(output, /querySelectorAll\('section'\)/);
  assert.doesNotMatch(output, /querySelectorAll\('img,section'\)|style\.backgroundImage/);
  assert.match(output, /x=rect\.right-8,y=rect\.bottom-8/);
  const generatedScript = output.match(/<script data-ezviz-ai-badge-code>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(generatedScript);
  assert.doesNotMatch(generatedScript, /}}/);
  assert.doesNotThrow(() => new Function(generatedScript));
  assert.equal(createAiBadgeHtml(output), output);
});

test("HTML AI badges can use the top right corner", () => {
  const output = createAiBadgeHtml('<div><section>Image</section></div>', "AI GENERATED", "top-right");
  assert.match(output, /x=rect\.right-8,y=rect\.top\+8/);
  assert.match(output, /translate\(-100%,0\)/);
});

test("HTML AI badges use the selected font size and keep the automatic default", () => {
  const source = '<div><section>Image</section></div>';
  assert.match(createAiBadgeHtml(source), /font:700 12px\/1 Arial/);
  assert.match(createAiBadgeHtml(source, "AI GENERATED", "bottom-right", "24"), /font:700 24px\/1 Arial/);
  assert.match(createAiBadgeHtml(source, "AI GENERATED", "bottom-right", "64"), /font:700 64px\/1 Arial/);
  assert.match(createAiBadgeHtml(source, "AI GENERATED", "bottom-right", "99"), /font:700 12px\/1 Arial/);
});

test("image AI badge HTML defaults to AI MODIFIED when label is omitted or blank", () => {
  const source = '<div><section>Image</section></div>';
  assert.match(createAiBadgeHtml(source), /badge\.textContent="AI MODIFIED"/);
  assert.match(createAiBadgeHtml(source, "  "), /badge\.textContent="AI MODIFIED"/);
});
