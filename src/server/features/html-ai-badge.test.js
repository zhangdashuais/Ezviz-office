const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { addSectionAiBadges } = require("./html-ai-badge");

test("marks real sections except the final text section", () => {
  const source = `<style>.x:before{content:"<section>"}</style><div class="page"><section class="hero"><img src="a.png"></section><section style="background:url(b.png)">Image</section><section class="notes">Footnotes</section></div><script>const sample = '<section>';</script>`;
  const result = addSectionAiBadges(source);
  assert.equal(result.sectionCount, 2);
  assert.match(result.html, /<section class="hero" data-ezviz-ai-section>/);
  assert.match(result.html, /<section style="background:url\(b.png\)" data-ezviz-ai-section>/);
  assert.match(result.html, /<section class="notes">Footnotes<\/section>/);
  assert.match(result.html, /<style>\.x:before\{content:"<section>"\}<\/style>/);
  assert.match(result.html, /<script>const sample = '<section>';<\/script>/);
  assert.equal((result.html.match(/data-ezviz-ai-section/g) || []).length, 3); // Two tags and one selector in runtime code.
});

test("reprocessing updates the label without duplicating badges", () => {
  const original = `<section>One</section><section>Two</section>`;
  const first = addSectionAiBadges(original);
  const second = addSectionAiBadges(first.html, { text: "AI 生成" });
  assert.equal(second.sectionCount, 1);
  assert.match(second.html, /<section>Two<\/section>/);
  assert.equal((second.html.match(/<style data-ezviz-ai-badge-code>/g) || []).length, 1);
  assert.equal((second.html.match(/<script data-ezviz-ai-badge-code>/g) || []).length, 1);
  assert.match(second.html, /AI 生成/);
  assert.equal(addSectionAiBadges(second.html, { text: "AI 生成" }).html, second.html);
});

test("does not treat a section string as an element", () => {
  assert.throws(() => addSectionAiBadges('<script>"<section>"</script>'), /没有找到/);
});

test("generated script survives the shop detail template processor", () => {
  const html = addSectionAiBadges("<section>Detail</section><section>Notes</section>").html;
  const script = html.match(/<script data-ezviz-ai-badge-code>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /\}\}/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("a page with only a final section receives no badge code", () => {
  const source = "<section>Notes</section>";
  const result = addSectionAiBadges(source);
  assert.equal(result.sectionCount, 0);
  assert.equal(result.html, source);
});
