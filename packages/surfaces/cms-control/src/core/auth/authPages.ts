import { escapeHtml, htmlResponse } from "@bernouy/http-runner";
import loginTemplate from "cms-control/static/login.html" with { type: "text" };
import forbiddenTemplate from "cms-control/static/forbidden.html" with { type: "text" };

const ERROR_ALERTS: Record<string, { type: string; message: string }> = {
    rate_limited: { type: "warning", message: "Too many attempts. Please wait a few minutes and try again." },
    oidc:         { type: "danger",  message: "Sign-in with that provider failed. Please try again." },
};
const DEFAULT_ALERT = { type: "danger", message: "Invalid email or password." };

export function renderLoginPage(req: Request, basePath: string): Response {
    const url      = new URL(req.url);
    const returnTo = url.searchParams.get("returnTo") ?? "";
    const code     = url.searchParams.get("error");

    let alert = "";
    if (code) {
        const a = ERROR_ALERTS[code] ?? DEFAULT_ALERT;
        alert = `<p9r-alert type="${a.type}">${a.message}</p9r-alert>`;
    }

    return renderPage(loginTemplate as unknown as string, {
        BASE_PATH: basePath,
        RETURN_TO: escapeHtml(returnTo),
        ERROR:     alert,
    });
}

export function renderForbiddenPage(basePath: string, logoutUrl: string): Response {
    return renderPage(forbiddenTemplate as unknown as string, {
        BASE_PATH:  basePath,
        LOGOUT_URL: escapeHtml(logoutUrl),
    }, 403);
}

function renderPage(template: string, subs: Record<string, string>, status = 200): Response {
    let html = template;
    for (const [key, value] of Object.entries(subs)) html = html.replaceAll(`{{${key}}}`, value);
    return htmlResponse(html, status);
}
