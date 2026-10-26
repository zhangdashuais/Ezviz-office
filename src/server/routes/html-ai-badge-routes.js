const express = require("express");
const { addSectionAiBadges } = require("../features/html-ai-badge");

function registerHtmlAiBadgeRoutes(app) {
  app.post("/api/html-ai-badge", express.text({ type: "text/plain", limit: "10mb" }), (req, res) => {
    try {
      const result = addSectionAiBadges(req.body, { text: req.query.text });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "HTML 打标失败。" });
    }
  });
}

module.exports = { registerHtmlAiBadgeRoutes };
