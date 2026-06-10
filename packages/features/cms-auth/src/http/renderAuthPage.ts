import { htmlResponse } from "@bernouy/http-runner";

/**
 * Render a standalone auth page: substitute `{{KEY}}` placeholders from `subs`
 * into `template` and return an HTML response. Values are inserted verbatim —
 * callers escape any user input (e.g. via `escapeHtml`) before passing it in.
 */
export function renderAuthPage(template: string, subs: Record<string, string>, status = 200): Response {
    let html = template;
    for (const [key, value] of Object.entries(subs)) html = html.replaceAll(`{{${key}}}`, value);
    return htmlResponse(html, status);
}
