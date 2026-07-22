import { describe, expect, mock, test } from "bun:test";
import { handleSourceRequest } from "cms-sources/http/handleSourceRequest";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import { dynamicOverlayHarness, okFetch, seededSourceRepository, SOURCE_PREFIX } from "./handleSourceFixtures";

describe("handleSourceRequest authorization", () => {
    test.each([
        { status: 403, decision: false, body: "Forbidden" },
        { status: 401, decision: { authorized: false, status: 401 as const }, body: "Unauthorized" },
    ])("returns $status without proxying a denied endpoint", async ({ status, decision, body }) => {
        const fetchImpl = okFetch();
        const authorizeEndpoint = mock(async () => decision);
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local" + SOURCE_PREFIX + "shop/getCart"),
            { prefix: SOURCE_PREFIX, deps: { fetchImpl, authorizeEndpoint } },
        );
        expect(response.status).toBe(status);
        expect(await response.text()).toBe(body);
        expect(authorizeEndpoint).toHaveBeenCalledTimes(1);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("proxies an allowed endpoint grant", async () => {
        const fetchImpl = okFetch();
        const authorizeEndpoint = mock(async (endpoint: { urn: string }) => endpoint.urn === "urn:shop:getCart");
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local" + SOURCE_PREFIX + "shop/getCart"),
            { prefix: SOURCE_PREFIX, deps: { fetchImpl, authorizeEndpoint } },
        );
        expect(response.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test.each([
        { name: "unknown endpoint", path: "shop/nope", method: "GET", decision: "allow", status: 404, calls: 0 },
        { name: "wrong method", path: "shop/getCart", method: "POST", decision: "allow", status: 405, calls: 0 },
        { name: "forbidden endpoint", path: "shop/getCart", method: "GET", decision: "forbid", status: 403, calls: 1 },
        {
            name: "unauthenticated endpoint",
            path: "shop/getCart",
            method: "GET",
            decision: "unauthenticated",
            status: 401,
            calls: 1,
        },
    ])("does no overlay work before authorization: $name", async ({ path, method, decision, status, calls }) => {
        const { repository, fetchImpl, resolveSecret } = await dynamicOverlayHarness();
        const authorizeEndpoint = mock(async () => {
            if (decision === "forbid") {
                return false;
            }
            if (decision === "unauthenticated") {
                return { authorized: false, status: 401 as const };
            }
            return true;
        });
        const response = await handleSourceRequest(
            repository,
            new Request(`http://local${SOURCE_PREFIX}${path}`, { method }),
            { prefix: SOURCE_PREFIX, deps: { fetchImpl, resolveSecret, authorizeEndpoint } },
        );
        expect(response.status).toBe(status);
        expect(authorizeEndpoint).toHaveBeenCalledTimes(calls);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(resolveSecret).not.toHaveBeenCalled();
    });

    test("materializes dynamic overlays only after authorization", async () => {
        const { repository, fetchImpl, resolveSecret } = await dynamicOverlayHarness();
        const authorizeEndpoint = mock(async () => {
            expect(fetchImpl).not.toHaveBeenCalled();
            expect(resolveSecret).not.toHaveBeenCalled();
            return true;
        });
        let dispatchedEndpoint: SourceEndpoint | undefined;
        const interceptEndpoint = mock(async (endpoint, request, next) => {
            dispatchedEndpoint = endpoint;
            return next(request);
        });
        const response = await handleSourceRequest(
            repository,
            new Request(`http://local${SOURCE_PREFIX}shop/getCart`),
            { prefix: SOURCE_PREFIX, deps: { fetchImpl, resolveSecret, authorizeEndpoint, interceptEndpoint } },
        );
        expect(response.status).toBe(200);
        expect(authorizeEndpoint).toHaveBeenCalledTimes(1);
        expect(resolveSecret).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(dispatchedEndpoint?.output?.[0]?.body).toMatchObject({
            properties: { metadata: { properties: { company: { type: "string" } } } },
        });
    });
});
