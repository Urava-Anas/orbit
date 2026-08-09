import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "src", "app");
const sourceRoot = path.join(root, "src");
const pagePattern = /^page\.(tsx|ts|jsx|js)$/;
const sourcePattern = /\.(tsx|ts|jsx|js)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function routeFromPage(file) {
  const relative = path.relative(appRoot, path.dirname(file));
  if (!relative) return "/";
  const segments = relative
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));
  return `/${segments.join("/")}`.replace(/\/+/g, "/");
}

const routes = walk(appRoot)
  .filter((file) => pagePattern.test(path.basename(file)))
  .map(routeFromPage);

function routeRegex(route) {
  if (route === "/") return /^\/$/;
  const parts = route.split("/").filter(Boolean).map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:.*)?";
    if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
    if (/^\[.+\]$/.test(segment)) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${parts.join("/")}/?$`);
}

const routeMatchers = routes.map((route) => ({ route, regex: routeRegex(route) }));

function normalizeHref(value) {
  const clean = value.split("#")[0].split("?")[0];
  if (!clean) return "/";
  return clean.length > 1 ? clean.replace(/\/$/, "") : clean;
}

function shouldIgnore(href) {
  return (
    !href.startsWith("/") ||
    href.startsWith("/api/") ||
    href.startsWith("/_next/") ||
    /\.[a-z0-9]{2,6}$/i.test(normalizeHref(href))
  );
}

const hrefPatterns = [
  /\bhref\s*=\s*["'](\/[^"']*)["']/g,
  /\bhref\s*:\s*["'](\/[^"']*)["']/g,
  /\bredirect\(\s*["'](\/[^"']*)["']\s*\)/g,
];

const references = [];
for (const file of walk(sourceRoot).filter((item) => sourcePattern.test(item))) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of hrefPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!shouldIgnore(match[1])) {
        references.push({ href: normalizeHref(match[1]), file: path.relative(root, file) });
      }
    }
  }
}

const missing = references.filter(
  ({ href }) => !routeMatchers.some(({ regex }) => regex.test(href)),
);

if (missing.length) {
  console.error("\nOrbit route integrity audit failed. Missing internal routes:\n");
  for (const item of missing) console.error(`- ${item.href}  (${item.file})`);
  console.error("\nFix the link or add an intentional canonical redirect page before deployment.\n");
  process.exit(1);
}

console.log(`Orbit route integrity: ${references.length} static internal links checked against ${routes.length} app routes.`);
