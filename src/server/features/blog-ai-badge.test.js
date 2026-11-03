const test = require("node:test");
const assert = require("node:assert/strict");
const { addBlogImageAiBadges } = require("./blog-ai-badge");

test("blog badges mark each image without changing its source HTML", () => {
  const source = '<div class="blog-detail-content"><p><img src="a.png" style="width:100%"/></p><a href="/x"><img src="b.png" alt="B"></a></div>';
  const result = addBlogImageAiBadges(source);
  assert.equal(result.imageCount, 2);
  assert.equal((result.html.match(/data-ezviz-blog-ai-image/g) || []).length, 2);
  assert.match(result.html, /<img src="a\.png" style="width:100%"\/>/);
  assert.match(result.html, /<a href="\/x"><span data-ezviz-blog-ai-image/);
  assert.doesNotMatch(result.html, /<script|<style/i);
});

test("blog badges wrap picture once and ignore fake img text", () => {
  const source = '<p>&lt;img src="fake.png"&gt;</p><picture><source srcset="wide.webp"><img src="real.png"></picture>';
  const result = addBlogImageAiBadges(source);
  assert.equal(result.imageCount, 1);
  assert.match(result.html, /data-ezviz-blog-ai-image[^>]*><picture><source srcset="wide.webp"><img src="real.png"><\/picture>/);
});

test("blog badge rerun updates text without duplicating wrappers", () => {
  const source = '<div><img src="a.png"></div>';
  const first = addBlogImageAiBadges(source).html;
  const second = addBlogImageAiBadges(first, { text: 'AI & <generated>' }).html;
  assert.equal((second.match(/data-ezviz-blog-ai-image/g) || []).length, 1);
  assert.match(second, /AI &amp; &lt;generated&gt;/);
  assert.equal(addBlogImageAiBadges(second, { text: 'AI & <generated>' }).html, second);
});

test("blog badges require a real image", () => {
  assert.throws(() => addBlogImageAiBadges('<p>No image</p>'), /没有找到/);
});
