import { expect } from "bun:test";
import type { RepositoryHubSurfaces } from "./cmsSurfaces";
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

export function patRequest(origin: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(`${origin}${path}`, { ...init, headers, redirect: "manual" });
}

export function assertBrowserBoundary(
    surfaces: RepositoryHubSurfaces,
    process: RepositoryProcess,
    browserResponses: readonly string[],
): void {
    const browserTraffic = JSON.stringify(surfaces.browserRequests);
    expect(browserTraffic).not.toContain(process.token);
    expect(browserTraffic).not.toContain(process.managementOrigin);
    expect(
        surfaces.browserRequests
            .filter((request) => !new URL(request.url).pathname.startsWith("/.cms/repository-management/"))
            .every((request) => request.authorization === null),
    ).toBeTrue();
    for (const response of browserResponses) {
        expect(response).not.toContain(process.token);
        expect(response).not.toContain(process.managementOrigin);
    }
}
