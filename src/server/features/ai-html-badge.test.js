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
  assert.match(output, /y=rect\.bottom-10/);
  const generatedScript = output.match(/<script data-ezviz-ai-badge-code>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(generatedScript);
  assert.doesNotMatch(generatedScript, /}}/);
  assert.doesNotThrow(() => new Function(generatedScript));
  assert.equal(createAiBadgeHtml(output), output);
});
