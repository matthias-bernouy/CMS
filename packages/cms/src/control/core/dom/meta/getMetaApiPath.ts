import { getMetaBasePath } from "./getMetaBasePath";

export function getMetaApiPath(): string {
    const base = getMetaBasePath();
    if ( base === undefined || base === null || base === "" ) return "/api"
    return base.endsWith("/") ? base + "api" : base + "/api";
}