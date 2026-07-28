import { isIP } from "node:net";

export function normalizeRepositoryManagementUrl(raw: string, allowInsecureHttp: boolean): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("Repository management URL must be an absolute HTTP(S) URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Repository management URL must be an absolute HTTP(S) URL");
    }
    if (url.username || url.password || url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error("Repository management URL must not contain credentials, query, or fragment");
    }
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname) && !allowInsecureHttp) {
        throw new Error(
            "Remote repository management URLs must use HTTPS; use --allow-insecure-http only on a trusted internal network",
        );
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

function isLoopbackHostname(value: string): boolean {
    const hostname = value
        .replace(/^\[|\]$/gu, "")
        .replace(/\.$/u, "")
        .toLowerCase();
    if (hostname === "localhost" || hostname === "::1") {
        return true;
    }
    return isIP(hostname) === 4 && hostname.split(".")[0] === "127";
}
