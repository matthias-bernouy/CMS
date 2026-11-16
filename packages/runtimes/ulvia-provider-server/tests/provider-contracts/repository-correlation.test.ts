import { expect, test } from "bun:test";
import { REQUEST_ID_HEADER, runWithRequestContext } from "@bernouy/http-runner/observability";
import { createCorrelatedRepositoryFetch } from "../../src/runtime/gateway/repositoryFetch";
import { createLogger } from "@bernouy/logging";
import type { LogRecord } from "@bernouy/logging";

test("Provider repository requests propagate the active inbound request id", async () => {
    const requestId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
    const inbound = new Request("http://provider.test/operation", { headers: { [REQUEST_ID_HEADER]: requestId } });
    let observed: Headers | undefined;
    const request = (async (_url: string | URL | Request, init?: RequestInit) => {
        observed = new Headers(init?.headers);
        return new Response("ok");
    }) as typeof fetch;
    const correlatedRepositoryFetch = createCorrelatedRepositoryFetch(request);

    await runWithRequestContext(inbound, () =>
        correlatedRepositoryFetch(new URL("http://repository.test/release"), {
            headers: { [REQUEST_ID_HEADER]: "ea7a3428-a45e-48d1-8a1c-bc61921ff0b5" },
        }),
    );
    expect(observed?.get(REQUEST_ID_HEADER)).toBe(requestId);
});

test("Repository phase diagnostics wait for response release and never record headers, query, bodies or credentials", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "provider-test", sink: (record) => records.push(record) });
    const request = createCorrelatedRepositoryFetch(async () => new Response("private response"), logger);
    const response = await request(new URL("https://repository.example/v1/recipes?private=query"), {
        method: "QUERY",
        headers: { authorization: "Bearer private-token" },
        body: "private input",
    });
    expect(records.map(({ event }) => event)).toEqual(["repository.response.headers"]);
    await response.text();
    expect(records.map(({ event }) => event)).toEqual(["repository.response.headers", "repository.response.released"]);
    expect(records[1]!.attributes).toMatchObject({
        origin: "https://repository.example",
        path: "/v1/recipes",
        method: "QUERY",
        status: 200,
    });
    expect(Number(records[1]!.attributes!.durationMs)).toBeGreaterThanOrEqual(
        Number(records[1]!.attributes!.headersMs),
    );
    const serialized = JSON.stringify(records);
    for (const secret of ["private-token", "private response", "private input", "private=query", "authorization"]) {
        expect(serialized).not.toContain(secret);
    }
});

test("Repository timeouts remain correlated failures and cancelling a response releases diagnostics once", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "provider-test", sink: (record) => records.push(record) });
    const timeout = new DOMException("private failure details", "TimeoutError");
    const failed = createCorrelatedRepositoryFetch(async () => {
        throw timeout;
    }, logger);
    await expect(failed(new URL("https://repository.example/v1/recipes"), {})).rejects.toBe(timeout);
    expect(records[0]).toMatchObject({ event: "repository.request.failed", attributes: { timedOut: true } });
    expect(JSON.stringify(records)).not.toContain("private failure details");
    const request = createCorrelatedRepositoryFetch(async () => new Response(new ReadableStream({})), logger);
    const response = await request(new URL("https://repository.example/v1/recipes"), {});
    await response.body!.cancel();
    expect(records.filter(({ event }) => event === "repository.response.released")).toHaveLength(1);
});
