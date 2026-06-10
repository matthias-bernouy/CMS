import { escapeHtml } from "@bernouy/core";
import template from "./forbidden.html" with { type: "text" };
import { renderAuthPage } from "./renderAuthPage";

/**
 * "No access" page for an authenticated but non-admin user. Markup lives in
 * `forbidden.html`; this substitutes `{{BASE_PATH}}` (theme tokens + component
 * bundle from `/assets`) and the escaped `{{LOGOUT_URL}}`.
 */
export function renderForbiddenPage(basePath: string, logoutUrl: string): Response {
    return renderAuthPage(template as unknown as string, {
        BASE_PATH:  basePath,
        LOGOUT_URL: escapeHtml(logoutUrl),
    }, 403);
}
