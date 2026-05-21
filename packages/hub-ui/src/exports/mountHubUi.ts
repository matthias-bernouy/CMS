import { join } from "node:path";
import type { Authentication, Runner } from "@bernouy/core";
import { serveStaticFolder, requireRole } from "@bernouy/core";
import { hubUiPackageRoot } from "src/constants";

export interface MountHubUiOptions<Role extends string> {
    runner:        Runner;
    /** Same `Authentication` instance as `mountHubApi` for cookie sharing. */
    auth:          Authentication<Role>;
    /** Role required to access the UI. Default = `"superadmin"`. */
    requiredRole?: Role;
    /** Mount prefix. Default = `"/admin"`. */
    uiBasePath?:   string;
}

const TEMPLATE_PATH    = join(hubUiPackageRoot, "src/assets/template.html");
const HUB_UI_CSS_PATH  = join(hubUiPackageRoot, "src/assets/hub-ui.css");
const HUB_UI_JS_PATH   = join(hubUiPackageRoot, "src/assets/hub-components.js");
const STATIC_PATH      = join(hubUiPackageRoot, "src/static");

// Vendored from @bernouy/webcomponents — resolved via node_modules of the
// consuming app at runtime (no copy at build).
const WC_PKG_ROOT = join(hubUiPackageRoot, "node_modules/@bernouy/webcomponents/dist");

/**
 * Registers the hub UI on the runner under `uiBasePath`. Pages live in
 * `src/static/`, served via `serveStaticFolder` with the chrome template.
 * The `@bernouy/webcomponents` bundle (ui.js + style.css) is served from
 * its node_modules location to avoid a copy step.
 *
 * Same `Authentication` as `mountHubApi` → cookie superadmin Keycloak
 * shared natively across the UI and the API (same-origin).
 */
export async function mountHubUi<Role extends string>(opts: MountHubUiOptions<Role>): Promise<void> {
    const role  = opts.requiredRole ?? ("superadmin" as Role);
    const base  = opts.uiBasePath   ?? "/admin";
    // Browser navigations to a gated UI route → redirect to the cookie
    // provider's login URL with returnTo, instead of the default JSON 401.
    const guard = requireRole(opts.auth, role, {
        csrf: "cookie-only",
        onUnauthenticated: (req, a) => {
            const u = new URL(req.url);
            const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
            if (!wantsHtml || !a.loginUrl) {
                return Response.json(
                    { ok: false, error: { code: "unauthenticated", message: "Authentication required." } },
                    { status: 401 },
                );
            }
            return Response.redirect(a.buildLoginUrl(`${u.pathname}${u.search}`), 302);
        },
    });

    const template = await Bun.file(TEMPLATE_PATH).text();

    opts.runner.group(base, (ui) => {
        // Webcomponents bundle + default theme — vendored from node_modules.
        ui.get("/assets/ui.js", () =>
            new Response(Bun.file(join(WC_PKG_ROOT, "ui.js")),
                { headers: { "Content-Type": "application/javascript" } }));
        ui.get("/assets/style.css", () =>
            new Response(Bun.file(join(WC_PKG_ROOT, "style.css")),
                { headers: { "Content-Type": "text/css" } }));

        // Hub-ui chrome assets (theme overrides + custom webcomponents).
        // Kept out of `src/static/` since static MUST contain HTML only.
        ui.get("/assets/hub-ui.css", () =>
            new Response(Bun.file(HUB_UI_CSS_PATH),
                { headers: { "Content-Type": "text/css" } }));
        ui.get("/assets/hub-components.js", () =>
            new Response(Bun.file(HUB_UI_JS_PATH),
                { headers: { "Content-Type": "application/javascript" } }));

        // All HTML pages live in src/static/ (markup only — no JS/CSS).
        void serveStaticFolder(ui, template, STATIC_PATH);
    }, [guard]);
}
