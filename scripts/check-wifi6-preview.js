fetch("http://localhost:3217/api/product-revision/common-preview", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sites: ["hq"],
    productNames: "HB8 Lite 4K",
    revisionType: "specification",
    specificationOperations: [{ type: "sanitize-wifi6" }]
  })
}).then(async (response) => {
  console.log(await response.text());
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
