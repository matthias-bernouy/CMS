import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = import.meta.dir;
const SITE = resolve(ROOT, "site");
const PAGES = resolve(SITE, "pages");
const REQUIRED_PAGES = [
    "404.html",
    "a-propos.html",
    "albums.html",
    "contact.html",
    "index.html",
    "informations/confidentialite.html",
    "informations/cookies.html",
    "informations/mentions-legales.html",
    "photo-album.html",
];
const publishMode = process.argv.includes("--publish");
const errors: string[] = [];
const blockers: string[] = [];

const pageNames = (await readdir(PAGES, { recursive: true })).filter((name) => name.endsWith(".html")).sort();
for (const name of REQUIRED_PAGES) {
    if (!pageNames.includes(name)) {
        errors.push(`Missing required page: ${name}`);
    }
}

let placeholderCount = 0;
for (const name of pageNames) {
    const body = await Bun.file(resolve(PAGES, name)).text();
    if (!body.startsWith("---\n") || !body.includes("\n---\n")) {
        errors.push(`${name}: missing frontmatter`);
    }
    if (
        !body.includes("<photo-site-shell>") ||
        !body.includes('<photo-site-header slot="header">') ||
        !body.includes('<photo-site-footer slot="footer">')
    ) {
        errors.push(`${name}: shared site shell is incomplete`);
    }
    if (/\s(?:class|style)=/u.test(body)) {
        errors.push(`${name}: authored pages must use Bloc composition instead of class or style attributes`);
    }
    if (/<script\b|<iframe\b|javascript:|fetch\s*\(/iu.test(body)) {
        errors.push(`${name}: authored pages must remain script- and fetch-free`);
    }
    if (/<(?:img|script|iframe)\b[^>]+\bsrc="https?:/iu.test(body)) {
        errors.push(`${name}: remote page media is not allowed in the portable template`);
    }
    placeholderCount += body.match(/data-template-placeholder/gu)?.length ?? 0;
    if (/\.example(?:["/<\s]|$)/iu.test(body)) {
        blockers.push(`${name}: replace reserved .example contact addresses`);
    }
}

const theme = await Bun.file(resolve(SITE, "theme.css")).text();
if (/^\s*\.[-_a-z]/imu.test(theme)) {
    errors.push("theme.css: class selectors belong in scoped Bloc styles");
}

for (const name of ["index.html", "albums.html"]) {
    const body = await Bun.file(resolve(PAGES, name)).text();
    for (const marker of [
        "<photo-album-list",
        'cms-repeat="data.items as album"',
        'data-photo-source-url="publicPhoto"',
        'data-source-image-access="public"',
        "data-source-width=",
        "data-source-height=",
    ]) {
        if (!body.includes(marker)) {
            errors.push(`${name}: missing Photo Albums marker ${marker}`);
        }
    }
}

const detail = await Bun.file(resolve(PAGES, "photo-album.html")).text();
for (const marker of [
    "<photo-album-gallery",
    'slug-param="slug"',
    'cms-repeat="data.photos as photo"',
    "data-photo-grid",
    "data-source-width=",
    "data-source-height=",
]) {
    if (!detail.includes(marker)) {
        errors.push(`photo-album.html: missing gallery marker ${marker}`);
    }
}

const system = await Bun.file(resolve(SITE, "system.json")).json();
if (system.site?.language !== "fr-FR") {
    errors.push("system.json: site language must be fr-FR");
}
if (system.site?.notFound?.path !== "/404") {
    errors.push("system.json: /404 must be configured as the not-found page");
}
if (!system.site?.host) {
    blockers.push("system.json: configure the final canonical site.host");
}

const registry = await Bun.file(resolve(SITE, ".cms-files-registry.json")).json();
const heroPath = "template/coastal-dawn.jpg";
const heroId = registry.byPath?.[heroPath];
if (!heroId || registry.byId?.[heroId]?.path !== heroPath) {
    errors.push(`CMS file registry: ${heroPath} is missing or inconsistent`);
}

if (placeholderCount > 0) {
    blockers.push(`replace ${placeholderCount} legal/contact template placeholders`);
}

if (errors.length > 0 || (publishMode && blockers.length > 0)) {
    for (const error of errors) {
        console.error(`ERROR: ${error}`);
    }
    if (publishMode) {
        for (const blocker of blockers) {
            console.error(`PUBLISH BLOCKER: ${blocker}`);
        }
    }
    process.exit(1);
}

console.log(`Template contract valid: ${pageNames.length} pages, ${placeholderCount} placeholders tracked.`);
if (blockers.length > 0) {
    console.log(`Publication remains intentionally blocked by ${blockers.length} configuration item(s).`);
}
