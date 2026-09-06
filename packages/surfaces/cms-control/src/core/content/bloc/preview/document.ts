import { randomBytes } from "node:crypto";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";

export function previewDocument(input: {
    basePath: string;
    title: string;
    content: string;
    scripts: string[];
    style: string;
}): Response {
    const nonce = randomBytes(18).toString("base64");
    const script = input.scripts.join("\n").replace(/<\/script/gi, "<\\/script");
    const policy = [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "media-src 'self' blob:",
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "frame-ancestors 'self'",
        "sandbox allow-scripts",
    ].join("; ");
    return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="basePath" content="${escapeHtml(input.basePath)}">
    <title>${escapeHtml(input.title)} · Preview</title>
    <style>${input.style.replace(/<\/style/gi, "<\\/style")}</style>
    <style>
        html { color-scheme: light; }
        body { margin: 0; min-height: 100vh; }
        [data-cms-bloc-preview] { display: block; }
        [data-p9r-composition], [data-p9r-composition-output] { display: contents; }
        [data-p9r-composition] > :not([data-p9r-composition-output]):not(template[data-p9r-composition-input]) { display: none !important; }
    </style>
</head>
<body>
    <${CMS_BINDING_CORE_TAG} ${CMS_BINDING_ATTRIBUTES.bindingDisabled} data-cms-bloc-preview inert>${input.content}</${CMS_BINDING_CORE_TAG}>
    <script nonce="${nonce}">${script}</script>
</body>
</html>`,
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "private, no-store",
                "Content-Security-Policy": policy,
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
            },
        },
    );
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
