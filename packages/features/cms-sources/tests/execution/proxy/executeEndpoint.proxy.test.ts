import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint, type ExecutorDeps } from "cms-sources/core/execution/executeEndpoint";
import { ep, okFetch } from "../../helpers/executeEndpointFixtures";

type SourceOutboundTransport = {
    fetch(url: string, init: RequestInit): Promise<Response>;
};

type ExecutorDepsWithTransport = ExecutorDeps & {
    transport: SourceOutboundTransport;
};

describe("executeEndpoint proxy", () => {
    test("forwards to the built upstream URL with only declared query params", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({
            input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] },
        });
        await executeEndpoint(endpoint, new Request("http://local/.cms/sources/x/e?lat=48.8&evil=1"), { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.example.com/v1/items?lat=48.8");
    });

    test("response headers are filtered and status is preserved", async () => {
        const fetchImpl = mock(
            async () =>
                new Response("body", {
                    status: 201,
                    headers: {
                        "content-type": "application/json",
                        "set-cookie": "a=b",
                        "access-control-allow-origin": "*",
                        "content-encoding": "gzip",
                        "content-length": "607",
                    },
                }),
        );
        const response = await executeEndpoint(
            ep({
                responseKind: "file",
                output: [{ status: "201" }],
            }),
            new Request("http://local/x"),
            { fetchImpl },
        );
        expect(response.status).toBe(201);
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("content-encoding")).toBeNull();
        expect(response.headers.get("content-length")).toBeNull();
    });

    test("missing required param returns 400 without fetch", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({
            input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] },
        });
        const response = await executeEndpoint(endpoint, new Request("http://local/x"), { fetchImpl });
        expect(response.status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("credentialed target returns a safe error without fetch", async () => {
        const fetchImpl = okFetch();
        const response = await executeEndpoint(
            ep({
                targetUrl: "https://user:super-secret@api.example.com/private",
            }),
            new Request("http://local/x"),
            { fetchImpl },
        );
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("targetUrl must not contain credentials");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test.failing("blocks a hostname when any resolved address is loopback", async () => {
        const resolveHost = mock(async (hostname: string) => {
            expect(hostname).toBe("mixed-records.example.invalid");
            return ["93.184.216.34", "127.0.0.1"];
        });
        const transport: SourceOutboundTransport = {
            fetch: mock(async (url, _init) => {
                const addresses = await resolveHost(new URL(url).hostname);
                if (addresses.includes("127.0.0.1")) {
                    throw new Error("resolved target contains a blocked address");
                }
                return Response.json({ public: true });
            }),
        };

        const response = await executeEndpoint(
            ep({
                targetUrl: "https://mixed-records.example.invalid/metadata",
            }),
            new Request("http://local/x"),
            {
                transport,
            } as ExecutorDepsWithTransport,
        );

        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(resolveHost).toHaveBeenCalledTimes(1);
        expect(response.status).not.toBe(200);
    });

    test("upstream body and failures are proxied", async () => {
        const bodyFetch = mock(async () => new Response("hello"));
        const response = await executeEndpoint(ep({ responseKind: "file" }), new Request("http://local/x"), {
            fetchImpl: bodyFetch,
        });
        expect(await response.text()).toBe("hello");

        const errorFetch = mock(async () => {
            throw new Error("ECONNREFUSED");
        });
        expect((await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl: errorFetch })).status).toBe(
            502,
        );
    });

    test("POST forwards the request body but GET never does", async () => {
        const postFetch = okFetch();
        await executeEndpoint(
            ep({ method: "POST" }),
            new Request("http://local/x", { method: "POST", body: "payload" }),
            { fetchImpl: postFetch },
        );
        expect((postFetch.mock.calls[0]![1]! as RequestInit).body).not.toBeUndefined();

        const getFetch = okFetch();
        await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl: getFetch });
        expect((getFetch.mock.calls[0]![1]! as RequestInit).body).toBeUndefined();
    });

    test("aborted upstream returns 504", async () => {
        const fetchImpl = mock(async () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            throw error;
        });
        expect((await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl })).status).toBe(504);
    });

    test("honors a bounded endpoint timeout override", async () => {
        const fetchImpl = mock(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            return await new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener(
                    "abort",
                    () => {
                        const error = new Error("aborted");
                        error.name = "AbortError";
                        reject(error);
                    },
                    { once: true },
                );
            });
        });

        const response = await executeEndpoint(ep({ timeoutMs: 5 }), new Request("http://local/x"), { fetchImpl });

        expect(response.status).toBe(504);
        expect(await response.text()).toBe("Source Timeout");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
