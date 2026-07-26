const test = require("node:test");
const assert = require("node:assert/strict");
const {
  countOccurrences,
  collectDetailAddressMatches,
  buildDetailAddressReplacement,
  validateRequest,
  planDetailOperations
} = require("./detail-address-replacement");

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
  assert.throws(
    () => validateRequest({
      productNames: "CP8",
      oldUrl: "https://same.example/a.jpg",
      newUrl: "https://same.example/a.jpg?v=2"
    }),
    /不能互相包含/
  );
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
