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

        for (const [k, v] of fileBlobMap.entries()) {
          if (k.endsWith("/" + normalizedRaw) || k.endsWith(normalizedRaw)) {
            return v;
          }
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
            const urlPart = part.split(/\s+/)[0];
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
            const parts = trimmed.split(/\s+/);
            const oldUrl = parts[0];
            const descriptor = parts.slice(1).join(" ");
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

      async function replaceHtmlImageUrlsByUpload(htmlText, fileBlobMap, indexDir, uploadApi) {
        const candidates = collectImageCandidates(htmlText);
        const mapping = {};
        const warnings = [];

        for (const rawUrl of candidates) {
          if (!isRelativeLocalUrl(rawUrl)) {
            continue;
          }

          const split = splitUrlSuffix(rawUrl);
          if (!looksLikeImagePath(split.pathPart)) {
            continue;
          }

          const fileBlob = findFileBlob(fileBlobMap, indexDir, split.pathPart);
          if (!fileBlob) {
            warnings.push("跳过图片(文件不存在): " + rawUrl);
            continue;
          }

          try {
            const uploaded = await uploadImage(fileBlob, uploadApi);
            mapping[rawUrl] = uploaded + split.suffix;
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            warnings.push("跳过图片(上传失败): " + rawUrl + "，原因: " + msg);
          }
        }

        let replaced = replaceAttrUrls(htmlText, mapping);
        replaced = replaceSrcsetUrls(replaced, mapping);
        replaced = replaceCssUrl(replaced, mapping);

        return {
          content: replaced,
          replaceCount: Object.keys(mapping).length,
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

      function buildResult(inputHtml, fileMap, indexPath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(inputHtml, "text/html");
        const imgStats = ensureLazyloadClassForImages(doc.body);
        const listStats = ensureSectionListDecimalStyle(doc.body);

        const indexDir = dirname(indexPath);
        const cssBlocks = [];
        const inlinedScripts = [];
        const keptRemoteScripts = [];
        const jqueryScripts = [];
        const localScriptSources = [];
        const remoteScriptSources = [];
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
            if (isRemote(src)) {
              jqueryScripts.push(scriptEl.outerHTML);
            } else {
              const jqueryText = findFileContent(fileMap, indexDir, src);
              if (jqueryText == null) {
                warnings.push("Missing jQuery file: " + src);
              } else {
                jqueryScripts.push(`<script>\n${escapeScriptClose(jqueryText)}\n</script>`);
              }
            }
            return;
          }

          if (scriptFileName !== "webflow.js") {
            warnings.push("Skipped non-webflow JS: " + src);
            return;
          }

          if (isRemote(src)) {
            keptRemoteScripts.push(scriptEl.outerHTML);
            remoteScriptSources.push(src);
            return;
          }

          const jsText = findFileContent(fileMap, indexDir, src);
          if (jsText == null) {
            warnings.push("未找到 JS 文件: " + src);
            return;
          }

          const typeAttr = scriptEl.getAttribute("type");
          const typePart = typeAttr ? ` type="${typeAttr}"` : "";
          const closeScriptTag = "</" + "script>";
          inlinedScripts.push(`<script${typePart}>\n${escapeScriptClose(jsText)}\n${closeScriptTag}`);
          localScriptSources.push(src);
        });

        allScripts.forEach((node) => node.remove());

        const bodyInner = `<div class="product-content-webflow">\n${doc.body.innerHTML.trim()}\n</div>`;

        const baseStyle = "img{\n  width: auto !important;\n}";
        const rawStyleContent = [baseStyle, ...cssBlocks].join("\n\n");
        const cssStats = sanitizeGeneratedCss(rawStyleContent);
        const styleContent = `.product-content-webflow {\n${cssStats.css}\n}`;
        const styleTag = `<style>\n${styleContent}\n</style>`;

        const webflowScripts = [...inlinedScripts, ...keptRemoteScripts];
        const scriptBlock = jqueryScripts.length && webflowScripts.length
          ? [
              "<script>var jq_1 = $.noConflict(true); window.$ = window.jQuery = jq_1;</script>",
              ...jqueryScripts,
              "<script>var jq_3 = $.noConflict(true); window.$ = window.jQuery = jq_3;</script>",
              ...webflowScripts,
              "<script>window.$ = window.jQuery = jq_1;</script>"
            ].join("\n\n")
          : [...jqueryScripts, ...webflowScripts].join("\n\n");

        const resultRaw = [
          "<!-- product detail webflow -->",
          styleTag,
          bodyInner,
          scriptBlock
        ]
          .filter(Boolean)
          .join("\n\n");

        warnings.push(`JS upload pending (local): ${localScriptSources.length ? localScriptSources.join(", ") : "none"}`);
        warnings.push(`JS remote references: ${remoteScriptSources.length ? remoteScriptSources.join(", ") : "none"}`);

        return {
          resultRaw,
          warnings,
          imgStats,
          listStats,
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
          const { resultRaw, warnings, imgStats, listStats, cssStats } = buildResult(indexHtml, fileMap, indexEntry);
          const normalizedImagePathResult = normalizeDotDotImagePaths(resultRaw);
          const normalizedResultRaw = normalizedImagePathResult.content;

          const imageConfig = typeof window.getImageProcessConfig === "function"
            ? window.getImageProcessConfig()
            : { mode: "prefix", baseUrl: "https://mfs.ezvizlife.com/", uploadApi: "https://fs.ezvizlife.com/upload.php" };

          const indexDir = dirname(indexEntry);
          let result = resultRaw;
          let replaceMessage = "";
          const imageWarnings = [];

          if (imageConfig.mode === "upload") {
            const uploaded = await replaceHtmlImageUrlsByUpload(
              normalizedResultRaw,
              fileBlobMap,
              indexDir,
              String(imageConfig.uploadApi || "").trim() || "https://fs.ezvizlife.com/upload.php"
            );
            result = uploaded.content;
            imageWarnings.push(...uploaded.warnings);
            replaceMessage = [
              "图片上传替换完成:",
              `成功替换: ${uploaded.replaceCount} 处`
            ].join("\n");
          } else {
            const replaced = replaceImageBasePaths(normalizedResultRaw, imageConfig.baseUrl);
            result = replaced.content;
            replaceMessage = [
              "图片前缀替换完成:",
              `../images/ -> ${normalizeBaseUrl(imageConfig.baseUrl)} : ${replaced.parentCount} 处`,
              `images/ -> ${normalizeBaseUrl(imageConfig.baseUrl)} : ${replaced.localCount} 处`
            ].join("\n");
          }

          outputEl.value = result;

          const blob = new Blob([result], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = "index.inlined.html";
          document.body.appendChild(a);
          a.click();
          a.remove();

          URL.revokeObjectURL(url);

          const summaryMessage = [
            `预处理替换 ../images/ -> images/ : ${normalizedImagePathResult.replaceCount} 处`,
            replaceMessage,
            `img lazyload 补充: ${imgStats.addedCount}/${imgStats.totalCount}`,
            `section 内 ul/ol 样式补充: ${listStats.updatedCount}/${listStats.totalListCount}`,
            `移除 font-family: Arial, sans-serif; : ${cssStats.removedArialCount} 处`,
            `移除 ul, ol 默认块: ${cssStats.removedUlOlRuleCount} 处`
          ].join("\n");

          const allWarnings = [...warnings, ...imageWarnings];

          if (allWarnings.length) {
            setStatus("处理完成，已下载 index.inlined.html\n" + summaryMessage + "\n" + allWarnings.join("\n"), "warn");
          } else {
            setStatus("处理完成，已下载 index.inlined.html\n" + summaryMessage, "ok");
          }
        } catch (err) {
          setStatus("处理失败: " + (err && err.message ? err.message : String(err)), "warn");
        } finally {
          runBtn.disabled = false;
        }
      }

      runBtn.addEventListener("click", run);
    })();
