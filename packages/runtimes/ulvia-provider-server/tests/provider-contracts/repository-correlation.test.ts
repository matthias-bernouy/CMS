import { expect, test } from "bun:test";
import { REQUEST_ID_HEADER, runWithRequestContext } from "@bernouy/http-runner/observability";
import { createCorrelatedRepositoryFetch } from "../../src/runtime/gateway/repositoryFetch";

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
