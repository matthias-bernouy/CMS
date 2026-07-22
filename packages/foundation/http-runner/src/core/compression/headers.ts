import { buildCspContent, type CspExtras } from "../buildCspContent";

/** Static security headers applied to compressed responses. */
export function securityHeaders(): Record<string, string> {
    return {
        "X-Content-Type-Options": "nosniff",
        "Strict-Transport-Security": "max-age=31536000",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        ...(process.env.MODE === "DEV"
            ? { "Cross-Origin-Opener-Policy-Report-Only": "same-origin" }
            : { "Cross-Origin-Opener-Policy": "same-origin" }),
        "Cross-Origin-Resource-Policy": "same-origin",
    };
}

// The header name is evaluated per call because the CLI may set MODE after
// importing this module.
function cspHeaderName(): string {
    return process.env.MODE === "DEV" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export function htmlCspHeader(): Record<string, string> {
    return { [cspHeaderName()]: buildCspContent() };
}

export function cspHeaderForEntry(contentType: string, extras?: CspExtras): Record<string, string> {
    if (!contentType.startsWith("text/html")) {
        return {};
    }
    if (!extras) {
        return htmlCspHeader();
    }
    return { [cspHeaderName()]: buildCspContent(extras) };
}

/** Cache policy for public assets, including conditional DEV revalidation. */
export function publicAssetCacheControl(req: Request): string {
    if (process.env.MODE === "DEV") {
        return "no-cache, must-revalidate";
    }
    const hasVersion = new URL(req.url).searchParams.has("v");
    return hasVersion ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate";
}
