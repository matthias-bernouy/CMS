import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApi } from "@bernouy/core";
import type { MtControlCms } from "src/exports/MtControlCms";
import { createSuperadminGuard } from "src/core/superadmin/createSuperadminGuard";

// here = .../packages/cms-control-mt/src/core/superadmin
// We need the package root (3x dirname) to resolve `src/...` and the
// vendored cms bundle under `node_modules/`.
const here = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = dirname(dirname(dirname(here)));

const BUNDLE_JS_RELPATH  = "node_modules/@bernouy/cms/src/control/static/assets/control-components.js";
const BUNDLE_CSS_RELPATH = "node_modules/@bernouy/cms/src/control/static/assets/control-styles.css";

const SHELL_HTML = (basePath: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMS — Superadmin</title>
    <meta name="basePath" content="${basePath}">
    <link rel="stylesheet" href="${basePath}/assets/control-styles.css">
    <script src="${basePath}/assets/control-components.js"></script>
</head>
<body>${body}</body>
</html>`;

/**
 * Registers the platform-level superadmin surface on the runner:
 *   /superadmin/         → tenants dashboard (HTML)
 *   /superadmin/assets/* → cms bundle + styles
 *   /superadmin/api/*    → tenant CRUD endpoints
 *
 * All routes guarded by `superadminAuth` (typically Keycloak cookie + bearer JWT
 * service-account composed externally) with role `superadmin`.
 */
export async function mountSuperadminSurface(mt: MtControlCms): Promise<void> {
    const guard = createSuperadminGuard(mt.superadminAuth);
    const indexPath = join(PKG_ROOT, "src/static/superadmin/index.html");

    mt.runner.group("/superadmin", (sub) => {
        sub.get("/", async () => {
            const body = await Bun.file(indexPath).text();
            const rendered = SHELL_HTML("/superadmin", body.replaceAll("{{BASE_PATH}}", "/superadmin"));
            return new Response(rendered, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        });
        sub.get("/admin", async () => Response.redirect("/superadmin/", 302));

        sub.get("/assets/control-components.js", () =>
            new Response(Bun.file(join(PKG_ROOT, BUNDLE_JS_RELPATH))));
        sub.get("/assets/control-styles.css", () =>
            new Response(Bun.file(join(PKG_ROOT, BUNDLE_CSS_RELPATH)),
                { headers: { "Content-Type": "text/css" } }));

        sub.group("/api", (api) =>
            serveApi(api, join(PKG_ROOT, "src/api/superadmin"), mt),
        [guard]);
    }, [guard]);
}
