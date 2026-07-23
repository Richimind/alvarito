#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const START_URL = "https://acaballero.es/";
const ORIGIN = new URL(START_URL).origin;
const OUT_DIR = process.cwd();
const EXTERNAL_DIR = "_external";
const MAX_PAGES = 80;
const MAX_ASSETS = 2000;

const pageQueue = [START_URL];
const assetQueue = [];
const queuedPages = new Set(pageQueue);
const queuedAssets = new Set();
const downloaded = new Map();
const failures = [];

const assetExts = new Set([
  ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
  ".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".mov",
  ".mp3", ".wav", ".pdf", ".json", ".xml",
]);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function decodeEntities(value) {
  return value
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/\\\//g, "/");
}

function normalizeUrl(raw, baseUrl) {
  if (!raw) return null;
  let value = decodeEntities(String(raw).trim());
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith("javascript:") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return null;
  }
  if (value.startsWith("//")) value = `https:${value}`;
  try {
    const parsed = new URL(value, baseUrl);
    parsed.hash = "";
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function shouldSkipPage(url) {
  const parsed = new URL(url);
  if (parsed.origin !== ORIGIN) return true;
  const p = parsed.pathname;
  if (
    p.startsWith("/wp-admin/") ||
    p.startsWith("/wp-json/") ||
    p === "/wp-content" ||
    p.startsWith("/wp-content/") ||
    p.startsWith("/wp-includes/") ||
    p.includes("/feed/") ||
    p === "/feed/" ||
    p === "/comments/feed/" ||
    p.endsWith("xmlrpc.php") ||
    p.endsWith("wp-login.php")
  ) {
    return true;
  }
  if (parsed.search && !parsed.search.startsWith("?page_id=")) return true;
  return false;
}

function looksLikeAsset(url) {
  if (!url) return false;
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase();
  return assetExts.has(ext);
}

function pagePath(url) {
  const parsed = new URL(url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/" || pathname === "") return path.join(OUT_DIR, "index.html");

  const basename = path.basename(pathname);
  const ext = path.extname(basename);
  if (!ext) {
    return path.join(OUT_DIR, pathname, "index.html");
  }
  if (ext.toLowerCase() === ".php") {
    return path.join(OUT_DIR, pathname.replace(/\.php$/i, ".html"));
  }
  return path.join(OUT_DIR, pathname);
}

function safeQueryName(search) {
  return search
    .replace(/^\?/, "")
    .replace(/[^a-zA-Z0-9._=-]+/g, "_")
    .slice(0, 120);
}

function assetPath(url) {
  const parsed = new URL(url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith("/")) pathname += "index";

  let base;
  if (parsed.origin === ORIGIN) {
    base = path.join(OUT_DIR, pathname);
  } else {
    base = path.join(OUT_DIR, EXTERNAL_DIR, parsed.hostname, pathname);
  }

  const ext = path.extname(base);
  if (!ext) {
    let name = safeQueryName(parsed.search) || "index";
    if (parsed.hostname === "fonts.googleapis.com" && pathname.startsWith("/css")) {
      name += ".css";
    }
    base = path.join(base, name);
  }
  return base;
}

function localPathFor(url, contentType = "") {
  if (contentType.includes("text/html")) return pagePath(url);
  if (contentType.includes("text/css")) return assetPath(url);
  if (new URL(url).origin !== ORIGIN) return assetPath(url);
  return looksLikeAsset(url) ? assetPath(url) : pagePath(url);
}

function relativeLink(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function localHref(rawUrl, baseUrl, fromFile) {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return rawUrl;
  const parsed = new URL(normalized);
  if ((parsed.hostname === "fonts.googleapis.com" || parsed.hostname === "fonts.gstatic.com") && parsed.pathname === "/") {
    return rawUrl;
  }
  if (parsed.origin !== ORIGIN && parsed.hostname !== "fonts.googleapis.com" && parsed.hostname !== "fonts.gstatic.com") {
    return rawUrl;
  }
  const target = looksLikeAsset(normalized) || parsed.origin !== ORIGIN
    ? assetPath(normalized)
    : pagePath(normalized);
  const rel = relativeLink(fromFile, target);
  return rel + (looksLikeAsset(normalized) ? "" : parsed.hash);
}

async function fetchUrl(url) {
  if (downloaded.has(url)) return downloaded.get(url);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 local static mirror",
      "accept": "*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const type = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const finalUrl = response.url || url;
  const result = { buffer, type, finalUrl };
  downloaded.set(url, result);
  if (finalUrl !== url) downloaded.set(finalUrl, result);
  return result;
}

function enqueueAsset(raw, baseUrl) {
  const url = normalizeUrl(raw, baseUrl);
  if (!url) return;
  const parsed = new URL(url);
  const allowedExternal = parsed.hostname === "fonts.googleapis.com" || parsed.hostname === "fonts.gstatic.com";
  if (parsed.origin !== ORIGIN && !allowedExternal) return;
  if (!queuedAssets.has(url) && queuedAssets.size < MAX_ASSETS) {
    queuedAssets.add(url);
    assetQueue.push(url);
  }
}

function enqueuePage(raw, baseUrl) {
  const url = normalizeUrl(raw, baseUrl);
  if (!url || shouldSkipPage(url) || looksLikeAsset(url)) return;
  if (!queuedPages.has(url) && queuedPages.size < MAX_PAGES) {
    queuedPages.add(url);
    pageQueue.push(url);
  }
}

function extractUrlsFromSrcset(value) {
  return value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
}

function extractResources(text, baseUrl, isHtml) {
  const attrRe = /\b(?:src|href|poster|data-src|data-lazy-src|data-bg|data-background|data-full-url|data-large_image)=["']([^"']+)["']/gi;
  for (const match of text.matchAll(attrRe)) {
    const value = decodeEntities(match[1]);
    const normalized = normalizeUrl(value, baseUrl);
    if (!normalized) continue;
    const parsed = new URL(normalized);
    const isFontAsset = parsed.hostname === "fonts.googleapis.com" || parsed.hostname === "fonts.gstatic.com";
    if (isFontAsset && parsed.pathname === "/") continue;
    if (isFontAsset) {
      enqueueAsset(value, baseUrl);
    } else if (isHtml && /\bhref=/i.test(match[0]) && !looksLikeAsset(normalized)) {
      enqueuePage(value, baseUrl);
    } else {
      enqueueAsset(value, baseUrl);
    }
  }

  const srcsetRe = /\b(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  for (const match of text.matchAll(srcsetRe)) {
    for (const src of extractUrlsFromSrcset(decodeEntities(match[1]))) enqueueAsset(src, baseUrl);
  }

  const cssUrlRe = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
  for (const match of text.matchAll(cssUrlRe)) enqueueAsset(match[2], baseUrl);

  const importRe = /@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?/gi;
  for (const match of text.matchAll(importRe)) enqueueAsset(match[1], baseUrl);

  const absoluteRe = /https?:\/\/acaballero\.es[^"'`<>)\s]*/gi;
  for (const match of text.matchAll(absoluteRe)) {
    const value = match[0];
    if (looksLikeAsset(value)) enqueueAsset(value, baseUrl);
    else if (isHtml) enqueuePage(value, baseUrl);
  }

  const escapedAbsoluteRe = /https?:\\\/\\\/acaballero\.es(?:\\\/|[^"'`<>)\s\\])*/gi;
  for (const match of text.matchAll(escapedAbsoluteRe)) {
    const value = match[0].replace(/\\\//g, "/");
    if (looksLikeAsset(value)) enqueueAsset(value, baseUrl);
    else if (isHtml) enqueuePage(value, baseUrl);
  }
}

function rewriteSrcset(value, baseUrl, fromFile) {
  return value
    .split(",")
    .map((part) => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      bits[0] = localHref(bits[0], baseUrl, fromFile);
      return bits.join(" ");
    })
    .join(", ");
}

function rewriteText(text, baseUrl, fromFile) {
  let output = text;

  output = output.replace(/\b(srcset|data-srcset)=["']([^"']+)["']/gi, (full, attr, value) => {
    return `${attr}="${rewriteSrcset(decodeEntities(value), baseUrl, fromFile)}"`;
  });

  output = output.replace(/\b(src|href|poster|action|data-src|data-lazy-src|data-bg|data-background|data-full-url|data-large_image)=["']([^"']+)["']/gi, (full, attr, value) => {
    return `${attr}="${localHref(decodeEntities(value), baseUrl, fromFile)}"`;
  });

  output = output.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, quote, value) => {
    return `url(${quote}${localHref(value, baseUrl, fromFile)}${quote})`;
  });

  output = output.replace(/https?:\\\/\\\/acaballero\.es(?:\\\/|[^"'`<>)\s\\])*/gi, (value) => {
    return localHref(value.replace(/\\\//g, "/"), baseUrl, fromFile);
  });

  output = output.replace(/https?:\/\/acaballero\.es[^"'`<>)\s]*/gi, (value) => {
    return localHref(value, baseUrl, fromFile);
  });

  output = output.replace(/https?:\\?\/\\?\/fonts\.(?:googleapis|gstatic)\.com\\?\/[^"'`<>)\s\\]+/gi, (value) => {
    return localHref(value.replace(/\\\//g, "/"), baseUrl, fromFile);
  });

  return output;
}

async function saveTextResource(url, baseUrl, text, type) {
  const file = localPathFor(url, type);
  extractResources(text, baseUrl, type.includes("text/html"));
  const rewritten = rewriteText(text, baseUrl, file);
  ensureDir(file);
  fs.writeFileSync(file, rewritten);
  return file;
}

async function processPage(url) {
  try {
    const { buffer, type, finalUrl } = await fetchUrl(url);
    const text = buffer.toString("utf8");
    const file = await saveTextResource(url, finalUrl, text, type || "text/html");
    console.log(`page  ${url} -> ${path.relative(OUT_DIR, file)}`);
  } catch (error) {
    failures.push({ url, error: error.message });
    console.warn(`fail  ${url} (${error.message})`);
  }
}

async function processAsset(url) {
  try {
    const { buffer, type, finalUrl } = await fetchUrl(url);
    const textLike = /text\/css|javascript|application\/json|application\/xml|text\/xml|text\/plain/.test(type);
    const file = localPathFor(finalUrl, type);
    if (textLike) {
      const text = buffer.toString("utf8");
      extractResources(text, finalUrl, false);
      const rewritten = rewriteText(text, finalUrl, file);
      ensureDir(file);
      fs.writeFileSync(file, rewritten);
    } else {
      ensureDir(file);
      fs.writeFileSync(file, buffer);
    }
    console.log(`asset ${url} -> ${path.relative(OUT_DIR, file)}`);
  } catch (error) {
    failures.push({ url, error: error.message });
    console.warn(`fail  ${url} (${error.message})`);
  }
}

async function main() {
  for (let index = 0; index < pageQueue.length && index < MAX_PAGES; index += 1) {
    await processPage(pageQueue[index]);
  }

  for (let index = 0; index < assetQueue.length && index < MAX_ASSETS; index += 1) {
    await processAsset(assetQueue[index]);
  }

  const report = {
    startUrl: START_URL,
    pagesQueued: queuedPages.size,
    assetsQueued: queuedAssets.size,
    downloaded: downloaded.size,
    failures,
  };
  fs.writeFileSync(path.join(OUT_DIR, "mirror-report.json"), JSON.stringify(report, null, 2));
  if (failures.length) {
    console.warn(`Done with ${failures.length} failures. See mirror-report.json`);
  } else {
    console.log("Done without failures.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
