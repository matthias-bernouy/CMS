import type { LoginMethod } from "@bernouy/cms-auth";
import { escapeHtml, htmlResponse } from "@bernouy/http-runner";
import loginTemplate from "cms-control/core/admin/auth/templates/login.html" with { type: "text" };

const ERROR_ALERTS: Record<string, { type: string; message: string }> = {
    rate_limited: { type: "warning", message: "Too many attempts. Please wait a few minutes and try again." },
    oidc: { type: "danger", message: "Sign-in with that provider failed. Please try again." },
};
const DEFAULT_ALERT = { type: "danger", message: "Invalid email or password." };

export function renderLoginPage(req: Request, basePath: string, methods: readonly LoginMethod[] = []): Response {
    const url = new URL(req.url);
    const returnTo = url.searchParams.get("returnTo") ?? "";
    const code = url.searchParams.get("error");

    let alert = "";
    if (code) {
        const a = ERROR_ALERTS[code] ?? DEFAULT_ALERT;
        alert = `<div class="alert" data-tone="${a.type}" role="alert">${a.message}</div>`;
    }

    const local = methods.find((method) => method.fields?.includes("email") && method.fields.includes("password"));
    const redirects = methods.filter((method): method is LoginMethod & { loginUrl: string } => !!method.loginUrl);

    return renderPage(loginTemplate as unknown as string, {
        BASE_PATH: basePath,
        RETURN_TO: escapeHtml(returnTo),
        ERROR: alert,
        LOCAL_FORM: local ? localForm(basePath, returnTo, local.displayName) : "",
        PROVIDER_METHODS: providerMethods(redirects, returnTo),
        NO_METHODS:
            methods.length === 0
                ? '<div class="alert" data-tone="warning" role="status">No sign-in method is currently available. Contact the site administrator.</div>'
                : "",
    });
}

function localForm(basePath: string, returnTo: string, displayName: string): string {
    return `<form class="login-form" method="POST" action="${escapeHtml(basePath)}/auth/login">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
        <div class="field">
            <label for="login-email">Email address</label>
            <input id="login-email" name="email" type="email" autocomplete="username" inputmode="email" required autofocus>
        </div>
        <div class="field">
            <div class="label-row"><label for="login-password">Password</label><span>Private session</span></div>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="primary-action" type="submit">Sign in with ${escapeHtml(displayName)}</button>
    </form>`;
}

function providerMethods(methods: readonly (LoginMethod & { loginUrl: string })[], returnTo: string): string {
    if (methods.length === 0) {
        return "";
    }
    return `<div class="provider-group">
        <div class="separator"><span>or continue with</span></div>
        ${methods
            .map(
                (method) =>
                    `<a class="provider-action" href="${escapeHtml(withReturnTo(method.loginUrl, returnTo))}">${escapeHtml(method.displayName)}<span aria-hidden="true">→</span></a>`,
            )
            .join("")}
    </div>`;
}

function withReturnTo(loginUrl: string, returnTo: string): string {
    if (!returnTo) {
        return loginUrl;
    }
    const separator = loginUrl.includes("?") ? "&" : "?";
    return `${loginUrl}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

function renderPage(template: string, subs: Record<string, string>, status = 200): Response {
    let html = template;
    for (const [key, value] of Object.entries(subs)) {
        html = html.replaceAll(`{{${key}}}`, value);
    }
    return htmlResponse(html, status);
}
