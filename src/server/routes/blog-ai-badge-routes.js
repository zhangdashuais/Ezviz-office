const express = require("express");
const { addBlogImageAiBadges } = require("../features/blog-ai-badge");

function registerBlogAiBadgeRoutes(app) {
  app.post("/api/blog-ai-badge", express.text({ type: "text/plain", limit: "10mb" }), (req, res) => {
    try {
      res.json({ ok: true, ...addBlogImageAiBadges(req.body, { text: req.query.text }) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Blog 图片打标失败。" });
    }
  });
}

module.exports = { registerBlogAiBadgeRoutes };
