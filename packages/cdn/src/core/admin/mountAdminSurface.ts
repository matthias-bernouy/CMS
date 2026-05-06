import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Runner } from "@bernouy/core";
import { serveApi, serveStaticFolder } from "@bernouy/core";
import type { StorageProvider } from "../../exports/StorageProvider";
import { cdnPackageRoot } from "../../constants";

const wcUiPath  = fileURLToPath(import.meta.resolve("@bernouy/webcomponents"));
const wcCssPath = fileURLToPath(import.meta.resolve("@bernouy/webcomponents/style.css"));

// Sidebar items shared with @bernouy/cdn-origin's admin template — keep
// the two in sync. Lucide outline icons (stroke=currentColor, fill=none).
const ICON_PACKAGE = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
const ICON_SERVER  = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;
const ICON_GLOBE   = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
const ICON_LOGOUT  = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`;

const ADMIN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CDN admin — Buckets</title>
<link rel="stylesheet" href="{{BASE_PATH}}/assets/style.css">
<style>html, body { margin: 0; padding: 0; height: 100%; }</style>
<script src="{{BASE_PATH}}/assets/ui.js" defer></script>
<script src="{{BASE_PATH}}/assets/components.js" defer></script>
</head>
<body>
<w13c-left-menu-layout style="--_content-padding: 0;">
    <w13c-lateral-menu slot="sidebar" style="width: 100%; height: 100%;">
        <h3 slot="header">CDN admin</h3>
        <w13c-lateral-menu-item href="/admin/buckets">${ICON_PACKAGE}Buckets</w13c-lateral-menu-item>
        <w13c-lateral-menu-item href="/admin/origin/">${ICON_SERVER}Origin</w13c-lateral-menu-item>
        <w13c-lateral-menu-item href="/admin/origin/edges">${ICON_GLOBE}Edges</w13c-lateral-menu-item>
        <w13c-lateral-menu-item slot="footer" href="/auth/logout">${ICON_LOGOUT}Logout</w13c-lateral-menu-item>
    </w13c-lateral-menu>
    <div>
        {{CONTENT}}
    </div>
</w13c-left-menu-layout>
</body>
</html>`;

/**
 * Mounts everything that lives under `/admin`: API folder, vendor assets,
 * the runtime-built custom components bundle, and the static folder. Kept
 * out of `StorageProvider` so the constructor stays readable.
 */
export function mountAdminSurface(admin: Runner, provider: StorageProvider): void {
    const componentsBundlePromise = buildComponentsBundle();

    console.log(wcCssPath, wcUiPath);
    admin.group("/api", (api) => {
        serveApi(api, join(cdnPackageRoot, "src/api/admin"), provider);
    });
    admin.get("/assets/ui.js",    () => new Response(Bun.file(wcUiPath)));
    admin.get("/assets/style.css", () => new Response(Bun.file(wcCssPath)));
    admin.get("/assets/components.js", async () => {
        const bundle = await componentsBundlePromise;
        if (!bundle) return new Response("// components build failed — see server logs", { status: 500 });
        return new Response(bundle, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    });
    serveStaticFolder(admin, ADMIN_TEMPLATE, join(cdnPackageRoot, "src/static/admin"));
}

async function buildComponentsBundle(): Promise<string | null> {
    const result = await Bun.build({
        entrypoints: [join(cdnPackageRoot, "src/components/index.ts")],
        target:       "browser",
        minify:        true,
    });
    if (!result.success) {
        console.error("[StorageProvider] components build failed:");
        for (const log of result.logs) console.error(log);
        return null;
    }
    return await result.outputs[0]!.text();
}
