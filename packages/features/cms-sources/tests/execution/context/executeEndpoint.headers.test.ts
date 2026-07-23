import { describe, expect, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import { ep, okFetch } from "../../helpers/executeEndpointFixtures";

describe("executeEndpoint headers", () => {
    test("forwards allowed request headers and strips credentials", async () => {
        const fetchImpl = okFetch();
        await executeEndpoint(
            ep(),
            new Request("http://local/x", {
                headers: { accept: "application/json", cookie: "secret", authorization: "Bearer x" },
            }),
            { fetchImpl },
        );
        const headers = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(headers.get("accept")).toBe("application/json");
        expect(headers.get("cookie")).toBeNull();
        expect(headers.get("authorization")).toBeNull();
    });

    test("static config headers are injected and can override forwarded headers", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ headers: [{ name: "Accept", source: { from: "static", value: "application/xml" } }] });
        await executeEndpoint(endpoint, new Request("http://local/x", { headers: { accept: "application/json" } }), {
            fetchImpl,
        });
        expect((fetchImpl.mock.calls[0]![1]!.headers as Headers).get("accept")).toBe("application/xml");
    });

    test("forbidden config headers are not forwarded", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ headers: [{ name: "Host", source: { from: "static", value: "evil.example.com" } }] });
        await executeEndpoint(endpoint, new Request("http://local/x"), { fetchImpl });
        expect((fetchImpl.mock.calls[0]![1]!.headers as Headers).get("host")).toBeNull();
    });

    test("injects correlation last only for an explicitly trusted connector target", async () => {
        const correlationId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
        const observability = {
            correlationId,
            measure: async <T>(_stage: string, operation: () => T | Promise<T>) => operation(),
            record: () => true,
        };
        const endpoint = ep({
            headers: [
                {
                    name: "x-cms-correlation-id",
                    source: { from: "static", value: "caller-controlled" },
                },
            ],
        });
        const trustedFetch = okFetch();
        await executeEndpoint(
            endpoint,
            new Request("http://local/x", { headers: { "x-cms-correlation-id": "untrusted-inbound" } }),
            {
                fetchImpl: trustedFetch,
                observability,
                isTrustedConnectorTarget: (_endpoint, target) => target.origin === "https://api.example.com",
            },
        );
        expect((trustedFetch.mock.calls[0]![1]!.headers as Headers).get("x-cms-correlation-id")).toBe(correlationId);

        const untrustedFetch = okFetch();
        await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl: untrustedFetch,
            observability,
            isTrustedConnectorTarget: () => false,
        });
        expect((untrustedFetch.mock.calls[0]![1]!.headers as Headers).get("x-cms-correlation-id")).toBeNull();
    });

    test("computed config header uses configured context", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ headers: [{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }] });
        await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveContext: async () => ({ userID: "user-123" }),
        });
        expect((fetchImpl.mock.calls[0]![1]!.headers as Headers).get("x-user-id")).toBe("user-123");
    });

    test("computed userRole header uses configured context", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ headers: [{ name: "X-User-Role", source: { from: "computed", ref: "userRole" } }] });
        await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveContext: async () => ({ userRole: "admin" }),
        });
        expect((fetchImpl.mock.calls[0]![1]!.headers as Headers).get("x-user-role")).toBe("admin");
    });

    test("computed config header failures stop before fetch", async () => {
        const endpoint = ep({ headers: [{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }] });
        const noResolver = okFetch();
        const missing = okFetch();

        const noResolverResponse = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl: noResolver,
        });
        expect(noResolverResponse.status).toBe(500);
        expect(await noResolverResponse.text()).toBe("computed headers require a configured context resolver");
        expect(noResolver).not.toHaveBeenCalled();

        const missingResponse = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl: missing,
            resolveContext: async () => ({}),
        });
        expect(missingResponse.status).toBe(401);
        expect(await missingResponse.text()).toBe('computed header unavailable: "X-User-ID"');
        expect(missing).not.toHaveBeenCalled();
    });
});
