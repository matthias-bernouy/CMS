import { getMetaApiPath } from "./getMetaApiPath";

export default function resolveApiUrl(path: string): URL {
    const apiPath = getMetaApiPath();
    const base = /^https?:\/\//.test(apiPath)
        ? apiPath
        : new URL(apiPath, window.location.origin).href;
    
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    return new URL(cleanBase + cleanPath);
}