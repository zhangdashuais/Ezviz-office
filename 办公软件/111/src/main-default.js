(function () {
      const folderInput = document.getElementById("folderInput");
      const runBtn = document.getElementById("runBtn");
      const statusEl = document.getElementById("status");
      const outputEl = document.getElementById("output");

      function setStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = "status" + (type ? " " + type : "");
      }

      function normalizePath(path) {
        return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
      }

      function toText(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取文件失败: " + file.name));
          reader.readAsText(file);
        });
      }

      function isRemote(url) {
        return /^(https?:)?\/\//i.test(url);
      }

      function isRelativeLocalUrl(url) {
        const lower = String(url || "").toLowerCase().trim();
        if (!lower) return false;
        if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("//")) return false;
        if (lower.startsWith("data:") || lower.startsWith("javascript:") || lower.startsWith("#")) return false;
        return true;
      }

      function dirname(path) {
        const normalized = path.replace(/\\/g, "/");
        const idx = normalized.lastIndexOf("/");
        return idx >= 0 ? normalized.slice(0, idx + 1) : "";
      }

      function resolveRelative(baseDir, ref) {
        const baseParts = baseDir.split("/").filter(Boolean);
        const refParts = ref.split("/");

        for (const part of refParts) {
          if (!part || part === ".") continue;
          if (part === "..") {
            baseParts.pop();
          } else {
            baseParts.push(part);
          }
        }

        return baseParts.join("/");
      }

      function findFileContent(fileMap, indexDir, refPath) {
        const raw = refPath.split("?")[0].split("#")[0];
        const normalizedRaw = normalizePath(raw);

        if (fileMap.has(normalizedRaw)) {
          return fileMap.get(normalizedRaw);
        }

        const resolved = normalizePath(resolveRelative(indexDir, raw));
        if (fileMap.has(resolved)) {
          return fileMap.get(resolved);
        }

        for (const [k, v] of fileMap.entries()) {
          if (k.endsWith("/" + normalizedRaw) || k.endsWith(normalizedRaw)) {
            return v;
          }
        }

        return null;
      }

      function escapeScriptClose(text) {
        return text.replace(/<\/script/gi, "<\\/script");
      }

      function normalizeBaseUrl(url) {
        const raw = String(url || "").trim();
        if (!raw) return "https://mfs.ezvizlife.com/";
        return raw.endsWith("/") ? raw : raw + "/";
      }

      function replaceImageBasePaths(content, baseUrl) {
        const targetBase = normalizeBaseUrl(baseUrl);
        const parentMatches = content.match(/\.\.\/images\//g) || [];
        const localMatches = content.match(/images\//g) || [];

        const withParentReplaced = content.replace(/\.\.\/images\//g, targetBase);
        const fullyReplaced = withParentReplaced.replace(/images\//g, targetBase);

        return {
          content: fullyReplaced,
          parentCount: parentMatches.length,
          localCount: Math.max(localMatches.length - parentMatches.length, 0)
        };
      }

      function normalizeDotDotImagePaths(content) {
        const matches = content.match(/\.\.\/images\//g) || [];
        return {
          content: content.replace(/\.\.\/images\//g, "images/"),
          replaceCount: matches.length
        };
      }

      function splitUrlSuffix(url) {
        const q = url.indexOf("?");
        const h = url.indexOf("#");
        const idx = q === -1 ? h : (h === -1 ? q : Math.min(q, h));
        if (idx === -1) {
          return { pathPart: url, suffix: "" };
        }
        return { pathPart: url.slice(0, idx), suffix: url.slice(idx) };
      }

      function looksLikeImagePath(urlPath) {
        const clean = String(urlPath || "").toLowerCase();
        return /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(clean);
      }

      function findFileBlob(fileBlobMap, indexDir, refPath) {
        const normalizedRaw = normalizePath(refPath);
        if (fileBlobMap.has(normalizedRaw)) {
          return fileBlobMap.get(normalizedRaw);
        }

        const resolved = normalizePath(resolveRelative(indexDir, refPath));
        if (fileBlobMap.has(resolved)) {
          return fileBlobMap.get(resolved);
        }

        const pathParts = normalizedRaw.split("/").filter(Boolean);
        const structuralTail = pathParts.length > 1 ? pathParts.slice(1).join("/") : normalizedRaw;
        const structuralMatches = [...fileBlobMap.entries()].filter(([key]) =>
          key === structuralTail || key.endsWith("/" + structuralTail)
        );
        if (structuralMatches.length === 1) {
          return structuralMatches[0][1];
        }

        const exactSuffixMatches = [...fileBlobMap.entries()].filter(([key]) =>
          key.endsWith("/" + normalizedRaw) || key.endsWith(normalizedRaw)
        );
        if (exactSuffixMatches.length === 1) {
          return exactSuffixMatches[0][1];
        }

        return null;
      }

      function collectImageCandidates(htmlText) {
        const attrPattern = /\b(?:src|href)=(["'])([^"']+)\1/gi;
        const srcsetPattern = /\bsrcset=(["'])(.*?)\1/gis;
        const cssUrlPattern = /url\(([^)]+)\)/gi;

        const items = [];
        let match;

        while ((match = attrPattern.exec(htmlText)) !== null) {
          items.push(match[2].trim());
        }

        while ((match = srcsetPattern.exec(htmlText)) !== null) {
          const srcsetValue = match[2];
          for (const item of srcsetValue.split(",")) {
            const part = item.trim();
            if (!part) continue;
            const urlPart = part.replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, "");
            items.push(urlPart);
          }
        }

        while ((match = cssUrlPattern.exec(htmlText)) !== null) {
          const raw = match[1].trim().replace(/^['"]|['"]$/g, "");
          items.push(raw);
        }

        const unique = [];
        const seen = new Set();
        for (const item of items) {
          if (!item || seen.has(item)) continue;
          seen.add(item);
          unique.push(item);
        }
        return unique;
      }

      async function uploadImage(file, uploadApi) {
        try {
          const localForm = new FormData();
          localForm.append("file", file, file.name);
          localForm.append("uploadApi", uploadApi);
          const localResponse = await fetch("/api/assets/upload-image", { method: "POST", body: localForm });
          const localPayload = await localResponse.json();
          if (localResponse.ok && localPayload.ok && localPayload.url) return localPayload.url;
          throw new Error(localPayload.error || "本地图片上传代理失败");
        } catch (error) {
          console.warn("本地图片上传代理不可用，尝试浏览器直传：", error);
        }

        const mimeCandidates = Array.from(new Set([
          file.type,
          "image/png",
          "image/jpeg",
          "application/octet-stream"
        ].filter(Boolean)));

        const dataCandidates = [
          { app: "mall", flag: "op_image", quality: "100", adapt: "1" },
          { app: "mall", mall: "1", flag: "1", cover: "1", quality: "100", adapt: "1" },
          { app: "mall", quality: "100", adapt: "1" },
          { quality: "100", adapt: "1" },
          {}
        ];

        let lastError = "";
        const maxAttempts = 6;
        let attempts = 0;

        for (const data of dataCandidates) {
          for (const mime of mimeCandidates) {
            attempts += 1;
            if (attempts > maxAttempts) {
              break;
            }

            const formData = new FormData();
            Object.entries(data).forEach(([k, v]) => formData.append(k, v));
            formData.append("file", new File([file], file.name, { type: mime }));

            try {
              const resp = await fetch(uploadApi, {
                method: "POST",
                body: formData
              });

              const text = await resp.text();
              let payload;
              try {
                payload = JSON.parse(text);
              } catch (_) {
                payload = { raw_text: text };
              }

              if (payload.full_url) {
                return payload.full_url;
              }
              if (payload.uri) {
                return "https://mfs.ezvizlife.com/" + String(payload.uri).replace(/^\/+/, "");
              }

              lastError = "status=" + resp.status + ", payload=" + text;
            } catch (err) {
              lastError = err && err.message ? err.message : String(err);
            }
          }
        }

        throw new Error(lastError || "上传接口未返回 full_url/uri");
      }

      function replaceAttrUrls(htmlText, mapping) {
        return htmlText.replace(/(\b(?:src|href)=(["']))([^"']+)(\2)/gi, (full, prefix, _q, oldUrl, suffix) => {
          const next = Object.prototype.hasOwnProperty.call(mapping, oldUrl) ? mapping[oldUrl] : oldUrl;
          return prefix + next + suffix;
        });
      }

      function replaceSrcsetUrls(htmlText, mapping) {
        return htmlText.replace(/(\bsrcset=(["']))(.*?)(\2)/gis, (full, prefix, _q, value, suffix) => {
          const nextItems = value.split(",").map((item) => {
            const trimmed = item.trim();
            if (!trimmed) return item;
            const descriptor = trimmed.match(/\s+(\d+(?:\.\d+)?[wx])\s*$/i)?.[1] || "";
            const oldUrl = descriptor ? trimmed.slice(0, trimmed.length - descriptor.length).trimEnd() : trimmed;
            const replaced = Object.prototype.hasOwnProperty.call(mapping, oldUrl) ? mapping[oldUrl] : oldUrl;
            return descriptor ? (replaced + " " + descriptor) : replaced;
          });
          return prefix + nextItems.join(", ") + suffix;
        });
      }

      function replaceCssUrl(htmlText, mapping) {
        return htmlText.replace(/url\(([^)]+)\)/gi, (full, raw) => {
          const stripped = raw.trim();
          const hasQuote = (stripped.startsWith('"') && stripped.endsWith('"')) || (stripped.startsWith("'") && stripped.endsWith("'"));
          const oldUrl = hasQuote ? stripped.slice(1, -1) : stripped;
          const replaced = Object.prototype.hasOwnProperty.call(mapping, oldUrl) ? mapping[oldUrl] : oldUrl;
          if (hasQuote) {
            const quote = stripped[0];
            return "url(" + quote + replaced + quote + ")";
          }
          return "url(" + replaced + ")";
        });
      }

      async function replaceHtmlImageUrlsByUpload(htmlText, fileBlobMap, indexDir, uploadApi, existingMapping, referenceMapping) {
        const candidates = collectImageCandidates(htmlText);
        const mapping = existingMapping || {};
        const warnings = [];
        const uploadTasks = [];

        for (const rawUrl of candidates) {
          if (Object.prototype.hasOwnProperty.call(mapping, rawUrl)) continue;
          if (!isRelativeLocalUrl(rawUrl)) continue;

          const split = splitUrlSuffix(rawUrl);
          if (!looksLikeImagePath(split.pathPart)) continue;

          const fileBlob = findFileBlob(fileBlobMap, indexDir, split.pathPart);
          if (!fileBlob) {
            warnings.push("Skip image(missing file): " + rawUrl);
            continue;
          }

          uploadTasks.push({ rawUrl, fileBlob, suffix: split.suffix });
        }

        const concurrency = 8;
        let cursor = 0;
        async function uploadNext() {
          while (cursor < uploadTasks.length) {
            const task = uploadTasks[cursor++];
            try {
              const uploaded = await uploadImage(task.fileBlob, uploadApi);
              mapping[task.rawUrl] = uploaded + task.suffix;
            } catch (err) {
              const msg = err && err.message ? err.message : String(err);
              if (referenceMapping && referenceMapping[task.rawUrl]) {
                mapping[task.rawUrl] = referenceMapping[task.rawUrl];
                warnings.push("Image upload failed, using store.html reference: " + task.rawUrl + ", reason: " + msg);
              } else {
                warnings.push("Skip image(upload failed): " + task.rawUrl + ", reason: " + msg);
              }
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, uploadTasks.length) }, uploadNext));
        let replaced = replaceAttrUrls(htmlText, mapping);
        replaced = replaceSrcsetUrls(replaced, mapping);
        replaced = replaceCssUrl(replaced, mapping);

        return {
          content: replaced,
          replaceCount: Object.keys(mapping).length,
          mapping,
          warnings
        };
      }

      function ensureLazyloadClassForImages(root) {
        const imgs = Array.from(root.querySelectorAll("img"));
        let addedCount = 0;

        imgs.forEach((img) => {
          const classAttr = img.getAttribute("class");
          if (!classAttr) {
            img.setAttribute("class", "lazyload");
            addedCount += 1;
            return;
          }

          const classList = classAttr.split(/\s+/).filter(Boolean);
          if (!classList.includes("lazyload")) {
            classList.push("lazyload");
            img.setAttribute("class", classList.join(" "));
            addedCount += 1;
          }
        });

        return {
          totalCount: imgs.length,
          addedCount
        };
      }

      function ensureSectionListDecimalStyle(root) {
        const sections = Array.from(root.querySelectorAll("section"));
        let updatedCount = 0;
        let totalListCount = 0;

        sections.forEach((section) => {
          const lists = Array.from(section.querySelectorAll("ul, ol"));
          totalListCount += lists.length;

          lists.forEach((listEl) => {
            const currentStyle = listEl.getAttribute("style") || "";
            if (/list-style\s*:/i.test(currentStyle)) {
              return;
            }

            const normalized = currentStyle.trim();
            const nextStyle = normalized
              ? `${normalized.replace(/;\s*$/, "")}; list-style: decimal !important;`
              : "list-style: decimal !important;";

            listEl.setAttribute("style", nextStyle);
            updatedCount += 1;
          });
        });

        return {
          totalListCount,
          updatedCount
        };
      }

      function sanitizeGeneratedCss(cssText) {
        const arialMatches = cssText.match(/font-family\s*:\s*Arial\s*,\s*sans-serif\s*;?/gi) || [];
        let tempCss = cssText.replace(/font-family\s*:\s*Arial\s*,\s*sans-serif\s*;?/gi, "");

        const sansSerifMatches = tempCss.match(/font-family\s*:\s*sans-serif\s*;?/gi) || [];
        tempCss = tempCss.replace(/font-family\s*:\s*sans-serif\s*;?/gi, "");

        const ulOlRulePattern = /ul\s*,\s*ol\s*\{\s*margin-top\s*:\s*0px\s*;\s*margin-bottom\s*:\s*10px\s*;\s*padding-left\s*:\s*40px\s*;\s*\}/gi;
        const ulOlMatches = tempCss.match(ulOlRulePattern) || [];
        tempCss = tempCss.replace(ulOlRulePattern, "");

        return {
          css: tempCss,
          removedArialCount: arialMatches.length,
          removedSansSerifCount: sansSerifMatches.length,
          removedUlOlRuleCount: ulOlMatches.length,
          // imgRuleCount: imgRuleCount
        };
      }

      function findStoreReferenceAssets(fileMap) {
        const storeEntry = [...fileMap.entries()].find(([key]) => key.endsWith("/store.html") || key === "store.html");
        const htmlText = storeEntry ? String(storeEntry[1] || "") : "";
        const cssUrl = htmlText.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/i)?.[1]
          || htmlText.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/i)?.[1]
          || "";
        const scriptUrls = [...htmlText.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
        const webflowJsUrl = scriptUrls.find((url) => /mfs\.ezvizlife\.com\/.*\.js(?:[?#].*)?$/i.test(url))
          || scriptUrls.find((url) => /webflow\.js(?:[?#].*)?$/i.test(url))
          || "";
        return { cssUrl, webflowJsUrl };
      }

      function buildStoreReferenceImageMapping(inputHtml, fileMap) {
        const storeEntry = [...fileMap.entries()].find(([key]) => key.endsWith("/store.html") || key === "store.html");
        if (!storeEntry) return {};

        const sourceUrls = collectImageCandidates(inputHtml)
          .filter((url) => isRelativeLocalUrl(url) && looksLikeImagePath(splitUrlSuffix(url).pathPart));
        const storeUrls = collectImageCandidates(String(storeEntry[1] || ""))
          .filter((url) => {
            const split = splitUrlSuffix(url);
            return /^https:\/\/mfs\.ezvizlife\.com\//i.test(url) && looksLikeImagePath(split.pathPart);
          });
        const mapping = {};
        sourceUrls.forEach((url, index) => {
          if (storeUrls[index]) mapping[url] = storeUrls[index];
        });
        return mapping;
      }

      function buildResult(inputHtml, fileMap, fileBlobMap, indexPath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(inputHtml, "text/html");

        const indexDir = dirname(indexPath);
        const cssBlocks = [];
        let webflowScriptFile = null;
        let webflowScriptType = "";
        const warnings = [];

        const head = doc.head;
        if (head) {
          const headStyles = head.querySelectorAll("style");
          headStyles.forEach((styleEl, i) => {
            cssBlocks.push(`/* inline-style-from-head-${i + 1} */\n${styleEl.textContent || ""}`);
          });

          const cssLinks = head.querySelectorAll("link[rel~='stylesheet'][href]");
          cssLinks.forEach((linkEl) => {
            const href = linkEl.getAttribute("href") || "";
            const cssFileName = href.split(/[?#]/, 1)[0].split("/").pop().toLowerCase();
            if (cssFileName === "normalize.css" || cssFileName === "webflow.css") {
              warnings.push("Skipped Webflow base CSS: " + href);
              return;
            }
            if (isRemote(href)) {
              warnings.push("跳过远程 CSS: " + href);
              return;
            }

            const cssText = findFileContent(fileMap, indexDir, href);
            if (cssText == null) {
              warnings.push("未找到 CSS 文件: " + href);
              return;
            }

            cssBlocks.push(`/* ${href} */\n${cssText}`);
          });
        }

        const allScripts = Array.from(doc.querySelectorAll("script[src]"));
        allScripts.forEach((scriptEl) => {
          const src = scriptEl.getAttribute("src") || "";
          const scriptFileName = src.split(/[?#]/, 1)[0].split("/").pop().toLowerCase();
          const isJquery = /^jquery(?:[-.].*)?\.js$/.test(scriptFileName);

          if (isJquery) {
            return;
          }

          if (scriptFileName !== "webflow.js") {
            warnings.push("Skipped non-webflow JS: " + src);
            return;
          }

          if (isRemote(src)) {
            webflowScriptFile = null;
            return;
          }

          const raw = src.split("?")[0].split("#")[0];
          webflowScriptFile = findFileBlob(fileBlobMap, indexDir, raw);
          if (!webflowScriptFile) {
            warnings.push("未找到 JS 文件: " + src);
            return;
          }

          webflowScriptType = scriptEl.getAttribute("type") || "text/javascript";
        });

        allScripts.forEach((node) => node.remove());

        const bodyInner = `<div class="page page-webflow"><link rel="stylesheet" href="__EZVIZ_REMOTE_CSS__">\n${doc.body.innerHTML.trim()}`;

        const rawStyleContent = cssBlocks.join("\n\n");
        const cssStats = sanitizeGeneratedCss(rawStyleContent);
        if (!window.EzvizCssScope?.scopeCss) {
          throw new Error("CSS scope module is not loaded.");
        }
        const cssContent = window.EzvizCssScope.scopeCss(cssStats.css, ".page.page-webflow");
        const jqueryUrl = "https://ovsmall-statics.ezvizlife.com/ovs_mall/web/js/widget/jquery/3.5.1/jquery.js";
        const scriptBlock = [
          "<script>var jq_1 = $.noConflict(true);window.$ = window.jQuery = jq_1;</script>",
          `<script src="${jqueryUrl}"></script>`,
          "<script>var jq_3 = $.noConflict(true);window.$ = window.jQuery = jq_3;</script>",
          `<script src="__EZVIZ_REMOTE_WEBFLOW_JS__" type="${webflowScriptType || "text/javascript"}"></script>`,
          "<script>window.$ = window.jQuery = jq_1;</script></div>"
        ].join("\n");

        const resultRaw = [
          "<!-- product detail webflow -->",
          bodyInner,
          scriptBlock
        ]
          .filter(Boolean)
          .join("\n");

        if (!webflowScriptFile) {
          warnings.push("Webflow JS upload pending: missing local js/webflow.js");
        }

        return {
          resultRaw,
          cssContent,
          webflowScriptFile,
          warnings,
          cssStats
        };
      }

      async function run() {
        const files = Array.from(folderInput.files || []);
        if (!files.length) {
          setStatus("请先选择整个 Magnetic series 文件夹", "warn");
          return;
        }

        runBtn.disabled = true;
        setStatus("正在读取文件并处理，请稍候...");

        try {
          const fileMap = new Map();
          const fileBlobMap = new Map();

          for (const file of files) {
            const rel = normalizePath(file.webkitRelativePath || file.name);
            fileBlobMap.set(rel, file);

            const ext = (file.name.split(".").pop() || "").toLowerCase();
            if (!["html", "css", "js"].includes(ext)) {
              continue;
            }

            const text = await toText(file);
            fileMap.set(rel, text);
          }

          const selectedHtml = typeof window.getSelectedHtmlFile === "function"
            ? normalizePath(window.getSelectedHtmlFile() || "")
            : "";

          let indexEntry = selectedHtml && fileMap.has(selectedHtml) ? selectedHtml : null;
          if (!indexEntry) {
            for (const key of fileMap.keys()) {
              if (key.endsWith("/index.html") || key === "index.html") {
                indexEntry = key;
                break;
              }
            }
          }

          if (!indexEntry) {
            throw new Error("上传内容中没有找到可处理的 HTML 文件");
          }

          const indexHtml = fileMap.get(indexEntry) || "";
          const { resultRaw, cssContent, webflowScriptFile, warnings, cssStats } = buildResult(indexHtml, fileMap, fileBlobMap, indexEntry);
          const normalizedImagePathResult = normalizeDotDotImagePaths(resultRaw);
          const normalizedResultRaw = normalizedImagePathResult.content;
          const normalizedCssPathResult = normalizeDotDotImagePaths(cssContent);
          let normalizedCssContent = normalizedCssPathResult.content;

          const imageConfig = typeof window.getImageProcessConfig === "function"
            ? window.getImageProcessConfig()
            : { mode: "upload", baseUrl: "https://mfs.ezvizlife.com/", uploadApi: "https://fs.ezvizlife.com/upload.php" };

          const indexDir = dirname(indexEntry);
          let result = resultRaw;
          let cssUrl = "";
          let webflowJsUrl = "";
          let replaceMessage = "";
          const imageWarnings = [];
          const uploadApi = String(imageConfig.uploadApi || "").trim() || "https://fs.ezvizlife.com/upload.php";
          const referenceAssets = findStoreReferenceAssets(fileMap);
          const referenceImageMapping = buildStoreReferenceImageMapping(indexHtml, fileMap);

          if (imageConfig.mode === "upload") {
            const uploaded = await replaceHtmlImageUrlsByUpload(
              normalizedResultRaw,
              fileBlobMap,
              indexDir,
              uploadApi,
              {},
              referenceImageMapping
            );
            result = uploaded.content;
            imageWarnings.push(...uploaded.warnings);
            const uploadedCssImages = await replaceHtmlImageUrlsByUpload(
              normalizedCssContent,
              fileBlobMap,
              indexDir,
              uploadApi,
              uploaded.mapping,
              referenceImageMapping
            );
            normalizedCssContent = uploadedCssImages.content;
            imageWarnings.push(...uploadedCssImages.warnings);
            const cssFile = new File([normalizedCssContent], "webflow.css", { type: "text/css" });
            try {
              cssUrl = await uploadImage(cssFile, uploadApi);
            } catch (err) {
              cssUrl = referenceAssets.cssUrl || "";
              imageWarnings.push("CSS upload failed, using store.html stylesheet reference: " + (err?.message || String(err)));
            }
            if (webflowScriptFile) {
              try {
                webflowJsUrl = await uploadImage(webflowScriptFile, uploadApi);
              } catch (err) {
                webflowJsUrl = referenceAssets.webflowJsUrl || "";
                imageWarnings.push("Webflow JS upload failed, using store.html script reference: " + (err?.message || String(err)));
              }
            }
            replaceMessage = [
              "Asset upload replacement completed:",
              `Images replaced: ${Object.keys(uploaded.mapping).length}`,
              `CSS: ${cssUrl || "not generated"}`,
              `Webflow JS: ${webflowJsUrl || "not generated"}`
            ].join("\n");
          } else {
            const replaced = replaceImageBasePaths(normalizedResultRaw, imageConfig.baseUrl);
            const replacedCss = replaceImageBasePaths(normalizedCssContent, imageConfig.baseUrl);
            result = replaced.content;
            normalizedCssContent = replacedCss.content;
            replaceMessage = [
              "Image prefix replacement completed:",
              `../images/ -> ${normalizeBaseUrl(imageConfig.baseUrl)} : ${replaced.parentCount}`,
              `images/ -> ${normalizeBaseUrl(imageConfig.baseUrl)} : ${replaced.localCount}`,
              `CSS images/ -> ${normalizeBaseUrl(imageConfig.baseUrl)} : ${replacedCss.localCount}`
            ].join("\n");
          }

          if (!cssUrl) {
            cssUrl = "data:text/css;charset=utf-8," + encodeURIComponent(normalizedCssContent);
          }
          if (!webflowJsUrl) {
            webflowJsUrl = "js/webflow.js";
          }

          result = result
            .replace("__EZVIZ_REMOTE_CSS__", cssUrl)
            .replace("__EZVIZ_REMOTE_WEBFLOW_JS__", webflowJsUrl);

          outputEl.value = result;

          const blob = new Blob([result], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = "store.html";
          document.body.appendChild(a);
          a.click();
          a.remove();

          URL.revokeObjectURL(url);

          const summaryMessage = [
            `Normalized ../images/ -> images/: HTML ${normalizedImagePathResult.replaceCount}, CSS ${normalizedCssPathResult.replaceCount}`,
            replaceMessage,
            `Removed font-family Arial/sans-serif: ${cssStats.removedArialCount + cssStats.removedSansSerifCount}`,
            `Removed ul/ol default reset blocks: ${cssStats.removedUlOlRuleCount}`
          ].join("\n");

          const allWarnings = [...warnings, ...imageWarnings];

          if (allWarnings.length) {
            setStatus("Completed, downloaded store.html\n" + summaryMessage + "\n" + allWarnings.join("\n"), "warn");
          } else {
            setStatus("Completed, downloaded store.html\n" + summaryMessage, "ok");
          }
        } catch (err) {
          setStatus("处理失败: " + (err && err.message ? err.message : String(err)), "warn");
        } finally {
          runBtn.disabled = false;
        }
      }

      runBtn.addEventListener("click", run);
    })();
