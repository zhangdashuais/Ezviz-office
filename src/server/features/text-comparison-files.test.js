const test = require("node:test");
const assert = require("node:assert/strict");
const {
  groupPdfItemsIntoLines,
  extractHtmlSegments
} = require("./text-comparison-files");

test("PDF text items split distant columns without splitting nearby words", () => {
  const lines = groupPdfItemsIntoLines([
    { str: "Image", transform: [1, 0, 0, 1, 10, 100], width: 25 },
    { str: "Sensor", transform: [1, 0, 0, 1, 38, 100], width: 30 },
    { str: "1/3 inch CMOS", transform: [1, 0, 0, 1, 180, 100], width: 70 },
    { str: "Network", transform: [1, 0, 0, 1, 500, 100], width: 55 }
  ]);
  assert.deepEqual(lines, ["Image Sensor", "1/3 inch CMOS", "Network"]);
});

test("HTML extraction includes visible text and excludes images and hidden content", () => {
  const segments = extractHtmlSegments(`
    <html><body>
      <h1>CB90f Triple Kit</h1>
      <p>Up to <strong>12x</strong> Mixed Zoom</p>
      <img src="camera.jpg" alt="should not be compared">
      <p hidden>Hidden copy</p>
      <script>console.log("ignored")</script>
    </body></html>
  `);
  assert.deepEqual(segments, [
    { tag: "h1", text: "CB90f Triple Kit" },
    { tag: "p", text: "Up to 12x Mixed Zoom" }
  ]);
});
