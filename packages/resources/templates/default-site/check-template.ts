import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = import.meta.dir;
const SITE = resolve(ROOT, "site");
const PAGES = resolve(SITE, "pages");
const FILES = resolve(SITE, "files");
const REQUIRED_PAGES = ["404.html", "about.html", "contact.html", "index.html"];
const REQUIRED_MEDIA = ["template/hero-studio.webp", "template/project-coast.webp", "template/project-objects.webp"];
const EDITABLE_TAGS = new Set([
    "a",
    "basic-badge",
    "basic-button",
    "basic-card",
    "basic-container",
    "basic-cta",
    "basic-faq",
    "basic-faq-item",
    "basic-feature-section",
    "basic-grid",
    "basic-hero",
    "basic-media-section",
    "basic-navbar",
    "basic-site-footer",
    "basic-stack",
    "blockquote",
    "footer",
    "h1",
    "h2",
    "h3",
    "header",
    "img",
    "li",
    "nav",
    "p",
    "section",
    "span",
    "ul",
]);
const errors: string[] = [];
const pageContents: string[] = [];

const pageNames = (await readdir(PAGES)).filter((name) => name.endsWith(".html")).sort();
if (JSON.stringify(pageNames) !== JSON.stringify(REQUIRED_PAGES)) {
    errors.push(`Expected pages ${REQUIRED_PAGES.join(", ")}; found ${pageNames.join(", ")}`);
}

for (const name of pageNames) {
    const body = await Bun.file(resolve(PAGES, name)).text();
    pageContents.push(body);
    if (!body.startsWith("---\n") || !body.includes("\n---\n")) {
        errors.push(`${name}: missing frontmatter`);
    }
    for (const marker of ["<header", 'role="main"', "<basic-navbar", "<basic-hero", "<basic-site-footer", "<h1"]) {
        if (!body.includes(marker)) {
            errors.push(`${name}: missing page-shell marker ${marker}`);
        }
    }
    if (/\b(?:class|style)=/iu.test(body)) {
        errors.push(`${name}: classes and inline styles are not allowed`);
    }
    if (/<(?:script|iframe)\b|javascript:|fetch\s*\(/iu.test(body)) {
        errors.push(`${name}: authored pages must remain script- and fetch-free`);
    }
    const tags = [...body.matchAll(/<([a-z][a-z0-9-]*)(?:\s|>)/gu)].map((match) => match[1]!);
    for (const tag of new Set(tags)) {
        if (!EDITABLE_TAGS.has(tag)) {
            errors.push(`${name}: ${tag} is not an editable Basic Bloc`);
        }
    }
}

for (const tag of ["basic-cta", "basic-faq", "basic-faq-item", "basic-feature-section", "basic-media-section"]) {
    if (!pageContents.some((body) => body.includes(`<${tag}`))) {
        errors.push(`pages: expected an editable ${tag} example`);
    }
}

if (await Bun.file(resolve(SITE, "theme.css")).exists()) {
    errors.push("theme.css: the default site must use the Basic Blocs design system without global CSS tokens");
}

const registry = await Bun.file(resolve(SITE, ".cms-files-registry.json")).json();
for (const path of REQUIRED_MEDIA) {
    const id = registry.byPath?.[path];
    if (!id || registry.byId?.[id]?.path !== path || !(await Bun.file(resolve(FILES, path)).exists())) {
        errors.push(`media: ${path} must have a stable registry id and a local file`);
    } else if (!pageContents.some((body) => body.includes(`/.cms/files/by-id/${id}`))) {
        errors.push(`media: ${path} is not referenced through its stable CMS file URL`);
    }
}

const integration = await Bun.file(resolve(SITE, "integrations/basic-blocs.json")).json();
if (JSON.stringify(integration) !== JSON.stringify({ kind: "basic-blocs", version: "1.0.0", answers: {} })) {
    errors.push("integrations: expected only the compact basic-blocs@1.0.0 import");
}

const system = await Bun.file(resolve(SITE, "system.json")).json();
if (system.site?.notFound?.path !== "/404" || !system.site?.language) {
    errors.push("system.json: language and /404 not-found configuration are required");
}
if (/token|secret|password|https?:\/\//iu.test(JSON.stringify(system))) {
    errors.push("system.json: deployment-specific values are not allowed");
}

if (errors.length > 0) {
    for (const error of errors) {
        console.error(`ERROR: ${error}`);
    }
    process.exit(1);
}

console.log(`Default template contract valid: ${pageNames.length} block-only pages.`);
