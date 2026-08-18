const test = require("node:test");
const assert = require("node:assert/strict");
const { chooseLanguageRowCandidate } = require("./language-package");

test("France selects fr-FR instead of the preceding fr-CA package", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-FRSTORE Delete Edit Download Phrase Missing", langCode: "fr-CA" },
    { rowText: "Français-FRSTORE Delete Edit Download Phrase Missing", langCode: "fr-FR" }
  ], "fr");

  assert.equal(selected.langCode, "fr-FR");
});

test("Canada prefers its English package when both Canadian locales exist", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-CASTORE Delete Edit Download", langCode: "fr-CA" },
    { rowText: "Canada (English)-CASTORE Delete Edit Download", langCode: "en-CA" }
  ], "ca");

  assert.equal(selected.langCode, "en-CA");
});

test("global action fallback also selects the France locale by lang_code", () => {
  const selected = chooseLanguageRowCandidate([
    { rowText: "Canada (Français)-FRSTORE", langCode: "fr-CA", actionIndex: 3 },
    { rowText: "Français-FRSTORE", langCode: "fr-FR", actionIndex: 7 }
  ], "fr");

  assert.equal(selected.actionIndex, 7);
});
