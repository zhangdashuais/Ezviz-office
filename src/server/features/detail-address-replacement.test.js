const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countOccurrences,
  collectDetailAddressMatches,
  buildDetailAddressReplacement,
  validateRequest,
  planDetailOperations,
  planProductOperations,
  collectAlbumImageMatches,
  collectWhitespaceFlexibleMatches,
  collectGuidElementMatches,
  isTransientShopLogoutMessage
} = require("./detail-address-replacement");

test("Detail save treats the shop logout refresh message as readback-required", () => {
  assert.equal(isTransientShopLogoutMessage("账号退出，请重新刷新"), true);
  assert.equal(isTransientShopLogoutMessage("保存参数错误"), false);
});

test("Product Album replacement only touches album/gallery fields", () => {
  const oldUrl = "https://old.example/hd.jpg";
  const newUrl = "https://new.example/hd.jpg";
  const plan = planProductOperations({
    pcView: { summary: `<img src="${oldUrl}">` },
    viewModel: {
      pcView: { summary: `<img src="${oldUrl}">` },
      productAlbum: [{ imageUrl: oldUrl }],
      gallery: { hd: oldUrl }
    }
  }, [{
    type: "replace-album-image",
    label: "Product Album 高清图",
    targetText: oldUrl,
    replacementText: newUrl
  }]);

  assert.equal(plan.matchCount, 2);
  assert.deepEqual(plan.steps[0].matches.map((match) => match.path), [
    "vm.productAlbum[0].imageUrl",
    "vm.gallery.hd"
  ]);
  assert.equal(collectAlbumImageMatches({ pcView: { summary: oldUrl } }, oldUrl).length, 0);
});

test("Detail replacement accepts a relative path or fragment as address 1", () => {
  const request = validateRequest({
    productName: "CP8",
    targetText: "/images/cp8.jpg",
    replacementText: "https://mfs.ezvizlife.com/images/cp8.jpg"
  });
  assert.equal(request.targetText, "/images/cp8.jpg");
  assert.equal(request.replacementText, "https://mfs.ezvizlife.com/images/cp8.jpg");
});

test("Detail replacement recursively updates exact matches in PC Detail strings", () => {
  const oldUrl = "https://old.example/image.png";
  const newUrl = "https://new.example/image.png";
  const pcView = {
    summary: `<img src="${oldUrl}"><a href="${oldUrl}">image</a>`,
    customs: [
      { name: "Specifications", value: `<img src="${oldUrl}">` },
      { name: "FAQ", value: "<p>unchanged</p>" }
    ]
  };
  const result = buildDetailAddressReplacement(pcView, oldUrl, newUrl);

  assert.equal(result.matchCount, 3);
  assert.deepEqual(result.oldMatches, [
    { path: "pcView.summary", count: 2 },
    { path: "pcView.customs[0].value", count: 1 }
  ]);
  assert.equal(collectDetailAddressMatches(result.updatedPcView, oldUrl).length, 0);
  assert.equal(
    collectDetailAddressMatches(result.updatedPcView, newUrl)
      .reduce((sum, item) => sum + item.count, 0),
    3
  );
  assert.equal(pcView.customs[0].value, `<img src="${oldUrl}">`);
});

test("Excel batch supports two address pairs and one code-block deletion per product", () => {
  const request = validateRequest({
    items: [{
      productName: "CP8",
      replacements: [
        {
          oldAddress: "https://old.example/one.jpg",
          newAddress: "https://new.example/one.jpg"
        },
        {
          oldAddress: "https://old.example/two.jpg",
          newAddress: "https://new.example/two.jpg"
        }
      ],
      deleteCodeBlock: "<script>removeMe()</script>"
    }]
  });
  assert.equal(request.operation, "batch");
  assert.equal(request.items[0].operations.length, 3);
  assert.deepEqual(
    request.items[0].operations.map((operation) => operation.label),
    ["删除代码块", "地址 1", "地址 2"]
  );
  assert.throws(
    () => validateRequest({
      items: [{
        productName: "CP8",
        replacements: [{
          oldAddress: "https://old.example/only.jpg",
          newAddress: ""
        }]
      }]
    }),
    /必须同时填写/
  );
});

test("batch planning deletes code first and then calculates address matches", () => {
  const oldUrl = "https://old.example/image.jpg";
  const codeBlock = `<script>const image = "${oldUrl}";</script>`;
  const request = validateRequest({
    items: [{
      productName: "CP8",
      oldAddress1: oldUrl,
      newAddress1: "https://new.example/image.jpg",
      deleteCodeBlock: codeBlock
    }]
  });
  const plan = planDetailOperations({
    summary: `${codeBlock}<img src="${oldUrl}">`
  }, request.items[0].operations);
  assert.equal(plan.steps[0].label, "删除代码块");
  assert.equal(plan.steps[0].matchCount, 1);
  assert.equal(plan.steps[1].label, "地址 1");
  assert.equal(plan.steps[1].matchCount, 1);
  assert.equal(
    plan.updatedPcView.summary,
    '<img src="https://new.example/image.jpg">'
  );
});

test("address replacement validates and de-duplicates product input", () => {
  assert.equal(countOccurrences("x--x--x", "x"), 3);
  assert.deepEqual(validateRequest({
    productNames: "CP8\nH8c，CP8",
    oldUrl: "https://old.example/a.jpg",
    newUrl: "https://new.example/a.jpg"
  }).productNames, ["CP8", "H8c"]);
  assert.throws(
    () => validateRequest({
      productNames: "CP8",
      oldUrl: "https://same.example/a.jpg",
      newUrl: "https://same.example/a.jpg"
    }),
    /不能相同/
  );
  assert.deepEqual(validateRequest({
    productNames: "CP8",
    oldUrl: 'src="/old/image.jpg"',
    newUrl: 'src="/new/image.jpg"'
  }).items[0].operations[0], {
    type: "replace",
    label: "地址替换",
    targetText: 'src="/old/image.jpg"',
    replacementText: 'src="/new/image.jpg"'
  });
});

test("code-block deletion preserves the exact target and replaces it with empty text", () => {
  const codeBlock = "  <script>\nwindow.example = true;\n</script>  ";
  const request = validateRequest({
    operation: "delete",
    productNames: "CP8",
    targetText: codeBlock
  });
  assert.equal(request.operation, "delete");
  assert.equal(request.targetText, codeBlock);
  assert.equal(request.replacementText, "");

  const result = buildDetailAddressReplacement(
    { summary: `<section>before</section>${codeBlock}<section>after</section>` },
    request.targetText,
    request.replacementText
  );
  assert.equal(result.matchCount, 1);
  assert.equal(
    result.updatedPcView.summary,
    "<section>before</section><section>after</section>"
  );
  assert.throws(
    () => validateRequest({
      operation: "delete",
      productNames: "CP8",
      targetText: "   "
    }),
    /完整代码块/
  );
});

test("code-block deletion tolerates editor-only whitespace changes when the match is unique", () => {
  const target = '<section class="hero">\n  <div>Green robot</div>\n</section>';
  const stored = '<section class="hero"> <div>Green robot</div> </section>';
  const plan = planDetailOperations({ summary: `before${stored}after` }, [{
    type: "delete",
    label: "删除代码块",
    targetText: target,
    replacementText: ""
  }]);

  assert.equal(collectWhitespaceFlexibleMatches({ summary: stored }, target).length, 1);
  assert.equal(plan.steps[0].matchingMode, "whitespace-flexible");
  assert.equal(plan.steps[0].matchCount, 1);
  assert.equal(plan.updatedPcView.summary, "beforeafter");
});

test("code-block deletion does not guess when whitespace-flexible matches are ambiguous", () => {
  const target = "<div>\n  repeated\n</div>";
  const stored = "<div> repeated </div>";
  const plan = planDetailOperations({ summary: `${stored}${stored}` }, [{
    type: "delete",
    label: "删除代码块",
    targetText: target,
    replacementText: ""
  }]);

  assert.equal(plan.steps[0].matchingMode, "exact");
  assert.equal(plan.steps[0].matchCount, 0);
});

test("code-block deletion uses a unique root data-guid when editor content changed", () => {
  const target = '<section data-guid="green-block"><div>old copy</div></section>';
  const stored = '<section class="changed" data-guid="green-block"><div>new copy</div></section>';
  const pcView = { summary: `before${stored}after` };
  const plan = planDetailOperations(pcView, [{
    type: "delete",
    label: "删除代码块",
    targetText: target,
    replacementText: ""
  }]);

  assert.equal(collectGuidElementMatches(pcView, target).length, 1);
  assert.equal(plan.steps[0].matchingMode, "guid-element");
  assert.equal(plan.steps[0].matchCount, 1);
  assert.equal(plan.updatedPcView.summary, "beforeafter");
});

test("code-block deletion does not use duplicate data-guid roots", () => {
  const target = '<section data-guid="duplicate"><div>old</div></section>';
  const stored = '<section data-guid="duplicate"><div>new</div></section>';
  const plan = planDetailOperations({ summary: `${stored}${stored}` }, [{
    type: "delete",
    label: "删除代码块",
    targetText: target,
    replacementText: ""
  }]);

  assert.equal(plan.steps[0].matchCount, 0);
});
