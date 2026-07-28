import { expect } from "bun:test";
import type { ManagementCmsSurfaces } from "./cmsSurfaces";
import type { RepositoryProcess } from "./repositoryProcess";

export function controlRequest(
    origin: string,
    path: string,
    session: string,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", `acceptance-session=${session}`);
    headers.set("origin", origin);
    return fetch(`${origin}${path}`, { ...init, headers, redirect: "manual" });
}

export function assertBrowserBoundary(
    surfaces: ManagementCmsSurfaces,
    process: RepositoryProcess,
    privateBaseUrl: string,
    browserResponses: readonly string[],
): void {
    const browserTraffic = JSON.stringify(surfaces.browserRequests);
    expect(browserTraffic).not.toContain(process.token);
    expect(browserTraffic).not.toContain(privateBaseUrl);
    expect(surfaces.browserRequests.every((request) => request.authorization === null)).toBeTrue();
    for (const response of browserResponses) {
        expect(response).not.toContain(process.token);
        expect(response).not.toContain(privateBaseUrl);
    }
}
