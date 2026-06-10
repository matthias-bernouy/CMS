import { escapeHtml } from "@bernouy/http-runner";
import template from "./login.html" with { type: "text" };
import { renderAuthPage } from "./renderAuthPage";

/** `error` query param → the alert shown on the login page. Messages are static
 *  (no user input), so they're injected as raw `<p9r-alert>` markup. */
const ERROR_ALERTS: Record<string, { type: string; message: string }> = {
    rate_limited: { type: "warning", message: "Too many attempts. Please wait a few minutes and try again." },
    oidc:         { type: "danger",  message: "Sign-in with that provider failed. Please try again." },
};
const DEFAULT_ALERT = { type: "danger", message: "Invalid email or password." };

/**
 * Standalone admin login page — served UNGUARDED (the authGuard redirects
 * unauthenticated users here via `buildLoginUrl`). The markup lives in
 * `login.html`; this substitutes `{{BASE_PATH}}` (theme tokens + component
 * bundle from `/assets`), the escaped `{{RETURN_TO}}`, and an `{{ERROR}}` alert
 * chosen from the `error` query param. The local credential form is a native
 * POST (full-page redirect); provider buttons come from `<cms-login-methods>`.
 */
export function renderLoginPage(req: Request, basePath: string): Response {
    const url      = new URL(req.url);
    const returnTo = url.searchParams.get("returnTo") ?? "";
    const code     = url.searchParams.get("error");

    let alert = "";
    if (code) {
        const a = ERROR_ALERTS[code] ?? DEFAULT_ALERT;
        alert = `<p9r-alert type="${a.type}">${a.message}</p9r-alert>`;
    }

    return renderAuthPage(template as unknown as string, {
        BASE_PATH: basePath,
        RETURN_TO: escapeHtml(returnTo),
        ERROR:     alert,
    });
}
