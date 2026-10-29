const { parse } = require("parse5");

const MARKER = "data-ezviz-ai-badge-code";
const SECTION_MARKER = "data-ezviz-ai-section";
const DEFAULT_TEXT = "AI GENERATED";

function removeExistingBadgeCode(html) {
  return html
    .replace(/<(style|script)\b(?=[^>]*\bdata-ezviz-ai-badge-code\b)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\sdata-ezviz-ai-scope(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/\sdata-ezviz-ai-section(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
}

function sectionTagOffsets(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const offsets = [];
  function visit(node) {
    if (node.tagName === "section" && node.sourceCodeLocation?.startTag) {
      offsets.push(node.sourceCodeLocation.startTag.endOffset - 1);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(document);
  return offsets;
}

function badgeCode(text) {
  const label = JSON.stringify(text).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<style ${MARKER}>.ezviz-ai-badge-layer{position:fixed;inset:0;z-index:9;pointer-events:none}.tab_inner{z-index:10}.ezviz-ai-badge-chip{position:absolute;padding:5px 8px;border:1px solid rgba(255,255,255,.22);border-radius:5px;background:rgba(0,0,0,.58);color:#fff;font:700 12px/1 Arial,sans-serif;white-space:nowrap;box-sizing:border-box}</style><script ${MARKER}>(function(){
  function start(){
    var sections=Array.from(document.querySelectorAll('[${SECTION_MARKER}]'));
    if(!sections.length)return;
    var old=document.querySelector('.ezviz-ai-badge-layer');if(old)old.remove();
    var layer=document.createElement('div');layer.className='ezviz-ai-badge-layer';document.body.appendChild(layer);
    var items=sections.map(function(el){var badge=document.createElement('span');badge.className='ezviz-ai-badge-chip';badge.textContent=${label};badge.setAttribute('aria-hidden','true');layer.appendChild(badge);return{el:el,badge:badge};});
    var queued=false;
    function update(){queued=false;items.forEach(function(item){
      var el=item.el,style=getComputedStyle(el),rect=el.getBoundingClientRect();
      var visible=el.isConnected&&style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0;
      var x=rect.right-10,y=rect.bottom-10;
      visible=visible&&x>0&&x<innerWidth&&y>0&&y<innerHeight;
      item.badge.hidden=!visible;
      if(visible){
        item.badge.style.left=x+'px';item.badge.style.top=y+'px';item.badge.style.transform='translate(-100%,-100%)';
        var badgeRect=item.badge.getBoundingClientRect();
        item.badge.hidden=Array.from(document.querySelectorAll('.tab_inner')).some(function(nav){
          var navRect=nav.getBoundingClientRect();
          return navRect.width>0&&navRect.height>0&&badgeRect.left<navRect.right&&badgeRect.right>navRect.left&&badgeRect.top<navRect.bottom&&badgeRect.bottom>navRect.top;
        });
      }
    });}
    function schedule(){if(!queued){queued=true;requestAnimationFrame(update);} }
    window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.addEventListener('load',schedule);document.addEventListener('load',schedule,true);document.addEventListener('click',schedule,true);
    if(typeof ResizeObserver==='function'){var observer=new ResizeObserver(schedule);items.forEach(function(item){observer.observe(item.el);});}
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;
}

function addSectionAiBadges(input, options = {}) {
  if (typeof input !== "string" || !input.trim()) throw new Error("请提供 HTML 代码。");
  const text = String(options.text || DEFAULT_TEXT).trim();
  if (!text || text.length > 80) throw new Error("标识文案需为 1 至 80 个字符。");
  const source = removeExistingBadgeCode(input);
  const offsets = sectionTagOffsets(source);
  if (!offsets.length) throw new Error("HTML 中没有找到 <section> 元素。");
  const targetOffsets = offsets.slice(0, -1);
  let html = source;
  for (const offset of targetOffsets.reverse()) {
    html = html.slice(0, offset) + ` ${SECTION_MARKER}` + html.slice(offset);
  }
  if (targetOffsets.length) {
    const code = badgeCode(text);
    const bodyEnd = /<\/body\s*>/i.exec(html);
    if (bodyEnd) html = html.slice(0, bodyEnd.index) + code + html.slice(bodyEnd.index);
    else html += code;
  }
  return { html, sectionCount: targetOffsets.length, skippedLastSection: true };
}

module.exports = { addSectionAiBadges };
