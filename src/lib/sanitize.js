const DROP = new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "form"]);

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function messageBody(message) {
  const html = message?.html;
  if (Array.isArray(html) && html.some((part) => String(part).trim())) {
    return html.join("\n");
  }
  if (typeof html === "string" && html.trim()) return html;
  return `<pre>${escapeText(message?.text || message?.intro || "")}</pre>`;
}

export function sanitizeEmailHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll([...DROP].join(",")).forEach((node) => node.remove());
  doc.querySelectorAll("style").forEach((node) => {
    node.textContent = node.textContent.replace(/url\s*\([^)]*\)/gi, "none");
  });
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on") || name === "srcdoc" || name === "srcset" || name === "formaction") {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === "style" && /url\s*\(/i.test(value)) {
        node.setAttribute(attr.name, value.replace(/url\s*\([^)]*\)/gi, "none"));
        continue;
      }
      if ((name === "href" || name === "src") && /^javascript:/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

export function extractLinks(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const seen = new Set();
  const links = [];
  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() || "";
    if (!/^https?:\/\//i.test(href) || seen.has(href)) return;
    seen.add(href);
    const text = anchor.textContent.replace(/\s+/g, " ").trim();
    links.push({ href, text: text || href });
  });
  return links;
}

export function srcdoc(html) {
  const safe = sanitizeEmailHtml(html);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;"><base target="_blank"></head><body style="margin:0;font:15px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1c1c1e;">${safe}</body></html>`;
}
