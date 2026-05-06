import { join } from "node:path";

import type { Runner } from "@bernouy/core";
import { serveApi, serveStaticFolder } from "@bernouy/core";

import type { OriginProvider } from "../../exports/OriginProvider";
import { originPackageRoot } from "../../constants";

/**
 * Sidebar items shared between the cdn admin and the origin admin. Keep
 * this list in sync with `packages/cdn/src/core/admin/mountAdminSurface.ts`
 * — the two surfaces look identical to the operator and live under the
 * same `/admin/*` namespace.
 *
 * Icons: Lucide outline style (stroke=currentColor, fill=none). The
 * LateralMenuItem styles slotted SVGs at 20×20 with stroke-width:2.
 */
const ICON_PACKAGE = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
const ICON_SERVER  = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;
const ICON_GLOBE   = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
const ICON_LOGOUT  = `<svg slot="icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`;

const ADMIN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CDN admin — Origin</title>
<link rel="stylesheet" href="/admin/assets/style.css">
<style>html, body { margin: 0; padding: 0; height: 100%; }</style>
<script src="/admin/assets/ui.js" defer></script>
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
    <div style="padding: 1.5rem 2rem;">
        {{CONTENT}}
    </div>
</w13c-left-menu-layout>
</body>
</html>`;

/**
 * Mounts the origin's own admin surface under whatever the parent runner
 * scopes us to (the entrypoint mounts us at `/admin/origin`):
 *  - `<scope>/api/*`     → API folder under `src/api/`
 *  - `<scope>/<page>`    → static HTML pages under `src/static/admin/`
 */
export function mountOriginAdminSurface(admin: Runner, provider: OriginProvider): void {
    admin.group("/api", (api) => {
        serveApi(api, join(originPackageRoot, "src/api"), provider);
    });
    serveStaticFolder(admin, ADMIN_TEMPLATE, join(originPackageRoot, "src/static/admin"));
}
