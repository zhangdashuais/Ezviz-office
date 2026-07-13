(function () {
  const byId = (id) => document.getElementById(id);
  const site = byId("specTranslationSite");
  const product = byId("specTranslationProduct");
  const locale = byId("specTranslationLocale");
  const excel = byId("specTranslationExcel");
  const preview = byId("specTranslationPreview");
  const submit = byId("specTranslationSubmit");
  const status = byId("specTranslationStatus");
  const html = byId("specTranslationHtml");
  const logs = byId("specTranslationLogs");
  if (!preview) return;

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
  }

  async function run(endpoint) {
    const file = excel.files && excel.files[0];
    if (!file) throw new Error("请选择 Specification 翻译 Excel。");
    const form = new FormData();
    form.append("specExcel", file);
    form.append("siteCode", site.value);
    form.append("productName", product.value.trim() || "CP8");
    form.append("locale", locale.value.trim() || site.value);
    if (!window.XLSX) throw new Error("XLSX 解析库未加载。");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
    const hint = (locale.value.trim() || site.value).toLowerCase();
    const aliases = { fr: ["français", "france", "french"], de: ["deutsch", "german"], it: ["italiano", "italian"], es: ["español", "spanish"], pl: ["polski", "polish"], nl: ["nederlands", "dutch"], pt: ["português", "portuguese"] };
    const needles = [hint].concat(aliases[hint] || []);
    let target = -1;
    for (let index = 0; index < (rows[0] || []).length; index += 2) {
      const header = String(rows[0][index] || "").toLowerCase();
      if (needles.some((needle) => header.includes(needle))) { target = index; break; }
    }
    if (target < 0) throw new Error("翻译 Excel 中没有找到目标语言列：" + hint);
    const normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const mapping = new Map();
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index] || [];
      [[row[0], row[target]], [row[1], row[target + 1]]].forEach(([source, translated]) => {
        const from = normalize(source); const to = normalize(translated);
        if (from && to && from !== to) mapping.set(from, to);
      });
    }
    form.append("translationsJson", JSON.stringify([...mapping].map(([source, target]) => ({ source, target }))));
    form.append("localeHeader", String(rows[0][target] || hint));
    const response = await fetch(endpoint, { method: "POST", body: form });
    const data = await response.json();
    logs.value = (data.logs || []).join("\n");
    if (!response.ok || !data.ok) throw new Error(data.error || "请求失败。");
    html.value = data.result.generatedHtml || "";
    return data;
  }

  preview.addEventListener("click", async () => {
    preview.disabled = true;
    submit.disabled = true;
    setStatus("正在打开商品编辑页并生成预览…");
    try {
      const data = await run("/api/specification/preview");
      submit.disabled = false;
      setStatus(`预览完成：替换 ${data.result.replaced} 个文本节点，保留 ${data.result.images.length} 张图片。`, "ok");
    } catch (error) {
      setStatus("预览失败：" + error.message, "warn");
    } finally { preview.disabled = false; }
  });

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    setStatus("正在写入 Specification 并点击 Complete…");
    try {
      const data = await run("/api/specification/submit");
      setStatus(`已保存 ${data.result.productName} Specification，替换 ${data.result.replaced} 个文本节点。`, "ok");
    } catch (error) {
      setStatus("保存失败：" + error.message, "warn");
      submit.disabled = false;
    }
  });
})();
