import { expect, test } from "bun:test";
import { HostedTransport } from "../../src/runtime/instances/system/hosting/transport/HostedTransport";
import type { HostingDomain, HostingInstanceState } from "@bernouy/hosting";

function fixture(fetcher: (url: URL, init: RequestInit) => Promise<Response>, maximum = 64) {
    let domain: HostingDomain | null = {
        hostname: "site.example",
        origin: "https://site.example",
        instanceId: "site",
        claimId: "claim",
        creationFingerprint: null,
        state: "active",
        tls: "ready",
        revision: 1,
    };
    let instance: HostingInstanceState | null = {
        id: "site",
        cmsUrl: "https://site.example",
        status: "ready",
        revision: 2,
    };
    const calls = { domains: 0, instances: 0 };
    const transport = new HostedTransport(
        "http://127.0.0.1:8080",
        {
            getDomain: async () => {
                calls.domains++;
                return domain;
            },
        },
        {
            getInstance: async () => {
                calls.instances++;
                return instance;
            },
        },
        fetcher,
        maximum,
    );
    return {
        transport,
        calls,
        domain: (value: HostingDomain | null) => {
            domain = value;
        },
        instance: (value: HostingInstanceState | null) => {
            instance = value;
        },
        current: () => domain!,
    };
}

test("hosted HTTP keeps its public identity and private destination without forwarding arbitrary Host or following redirects", async () => {
    const requests: { url: string; headers: Headers; redirect: RequestRedirect | undefined }[] = [];
    const f = fixture(async (url, init) => {
        requests.push({ url: url.href, headers: new Headers(init.headers), redirect: init.redirect });
        return new Response(null, { status: 302, headers: { location: "https://foreign.example" } });
    });
    const result = await f.transport.request(new URL("https://site.example/.cms/call/ulvia/repository/v1/info"), {
        headers: { host: "foreign.example", authorization: "Bearer private-account-token" },
        redirect: "follow",
    });
    expect(result.status).toBe(302);
    expect(requests[0]!.url).toBe("http://127.0.0.1:8080/.cms/call/ulvia/repository/v1/info");
    expect(requests[0]!.headers.get("host")).toBe("site.example");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer private-account-token");
    expect(requests[0]!.redirect).toBe("manual");
    expect(f.calls).toEqual({ domains: 1, instances: 1 });
    f.domain(null);
    await f.transport.request(new URL("https://outside.example/v1/info"), {});
    expect(requests[1]!.url).toBe("https://outside.example/v1/info");
    expect(f.calls).toEqual({ domains: 2, instances: 1 });
});

test("disabled, reassigned-origin and unfinished hosted targets refuse without network access or external fallback", async () => {
    let sent = 0;
    const f = fixture(async () => {
        sent++;
        return Response.json({});
    });
    const current = f.current();
    for (const change of [
        { state: "disabled" as const },
        { state: "verified" as const },
        { origin: "https://site.example:8443" },
    ]) {
        f.domain({ ...current, ...change });
        await expect(f.transport.request(new URL(current.origin), {})).rejects.toThrow("not active");
    }
    f.domain(current);
    f.instance(null);
    await expect(f.transport.request(new URL(current.origin), {})).rejects.toThrow("not ready");
    f.instance({ id: "foreign", cmsUrl: current.origin, status: "ready", revision: 2 });
    await expect(f.transport.request(new URL(current.origin), {})).rejects.toThrow("not ready");
    await expect(f.transport.request(new URL("https://site.example."), {})).rejects.toThrow("not active");
    expect(sent).toBe(0);
    expect(f.calls).toEqual({ domains: 6, instances: 2 });
});

test("hosted HTTP capacity remains held through streamed completion and cancellation, and failures release it", async () => {
    let fail = false;
    const f = fixture(async () => {
        if (fail) {
            throw new Error("socket failed");
        }
        return new Response(new ReadableStream<Uint8Array>({}));
    }, 1);
    const first = await f.transport.request(new URL("https://site.example/data"), {});
    await expect(f.transport.request(new URL("https://site.example/data"), {})).rejects.toThrow("capacity");
    await first.body!.cancel();
    fail = true;
    await expect(f.transport.request(new URL("https://site.example/data"), {})).rejects.toThrow("socket failed");
    fail = false;
    const retry = await f.transport.request(new URL("https://site.example/data"), {});
    await retry.body!.cancel();
});

test("network callbacks authorize their original endpoint and use the registered Host on the pinned private socket", async () => {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) =>
            Response.json({
                host: request.headers.get("host"),
                path: new URL(request.url).pathname,
                auth: request.headers.get("authorization"),
            }),
    });
    const f = fixture(fetch);
    const transport = new HostedTransport(
        server.url.origin,
        { getDomain: async () => f.current() },
        {
            getInstance: async () => ({ id: "site", cmsUrl: "https://site.example", status: "ready", revision: 2 }),
        },
    );
    const authorized: string[] = [];
    const network = transport.network({
        allowPrivateAddresses: true,
        authorize: async (request) => {
            authorized.push(request.origin);
            return { token: "scoped-return-token-for-selected-connection" };
        },
    });
    try {
        const request = {
            origin: "https://site.example",
            pathAndQuery: "/.cms/call/ulvia/cms.content/pages/list",
            method: "QUERY" as const,
            headers: { "content-type": "application/json" },
            body: "{}",
            requestId: crypto.randomUUID(),
            providerTokenRef: "connection",
            authentication: {
                kind: "capability" as const,
                instanceId: "site",
                contractId: "ulvia/cms.content",
                contractVersion: "1.1.0",
                capabilityId: "pages.list",
            },
            signal: AbortSignal.timeout(5000),
        };
        const response = await network.exchange(request);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            host: "site.example",
            path: request.pathAndQuery,
            auth: "Bearer scoped-return-token-for-selected-connection",
        });
        expect(authorized).toEqual(["https://site.example"]);
        await expect(network.exchange({ ...request, headers: { host: "foreign.example" } })).rejects.toThrow(
            "forbidden header",
        );
        expect(authorized).toHaveLength(1);
    } finally {
        await server.stop(true);
    }
});
