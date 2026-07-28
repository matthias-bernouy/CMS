import { isIP } from "node:net";

const REPOSITORY_MANAGEMENT_PATH = "/.cms/repository-management";

export function normalizeRepositoryCmsUrl(raw: string, allowInsecureHttp: boolean): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("Repository CMS URL must be an absolute HTTP(S) URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Repository CMS URL must be an absolute HTTP(S) URL");
    }
    if (url.username || url.password || url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error("Repository CMS URL must not contain credentials, query, or fragment");
    }
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname) && !allowInsecureHttp) {
        throw new Error(
            "Remote repository CMS URLs must use HTTPS; use --allow-insecure-http only on a trusted internal network",
        );
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

export function repositoryManagementUrlForCms(cmsUrl: string): string {
    const url = new URL(cmsUrl);
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}${REPOSITORY_MANAGEMENT_PATH}`;
    return url.href;
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
