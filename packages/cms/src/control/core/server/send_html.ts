import { SECURITY_HEADERS, HTML_CSP_HEADER } from "src/socle/server/compression";

export function send_html(html: string, status: number = 200) {
    return new Response(html, {
        headers: { "Content-Type": "text/html", ...SECURITY_HEADERS, ...HTML_CSP_HEADER },
        status,
    });
}