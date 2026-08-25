function normalizeDetailFieldName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const SPECIFICATION_FIELD_NAMES = [
  "specifications",
  "specification",
  "specs",
  "specificaties",
  "spezifikationen",
  "spécifications",
  "especificaciones",
  "specifiche",
  "especificações",
  "ข้อมูลจำเพาะ",
  "spesifikasi",
  "thôngsốkỹthuật",
  "仕様",
  "사양",
  "规格参数",
  "техническиехарактеристики",
  "specyfikacja",
  "specifikace",
  "tekniközellikler",
  "specificații",
  "المواصفات"
];

function readDetailFieldsFromModel(viewModel) {
  const pcView = viewModel?.pcView && typeof viewModel.pcView === "object"
    ? viewModel.pcView
    : {};
  const customFields = Array.isArray(pcView.customs) ? pcView.customs : [];
  const specificationsField = SPECIFICATION_FIELD_NAMES
    .map((name) => customFields.find(
      (field) => normalizeDetailFieldName(field?.name) === name
    ))
    .find(Boolean);
  return {
    overview: String(pcView.summary || ""),
    specifications: String(specificationsField?.value || ""),
    overviewFound: Object.prototype.hasOwnProperty.call(pcView, "summary"),
    specificationsFound: Boolean(specificationsField),
    specificationsFieldName: specificationsField?.name || ""
  };
}

function parseProductNames(value) {
  const source = Array.isArray(value) ? value : [value];
  const names = source
    .flatMap((item) => String(item || "").split(/[\r\n,，;；]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  normalizeDetailFieldName,
  readDetailFieldsFromModel,
  parseProductNames
};
