import { describe, expect, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import { ep, okFetch } from "./helpers/executeEndpointFixtures";

const computedParam = {
    name: "user_id",
    in: "query" as const,
    required: true,
    source: { from: "computed" as const, ref: "userID" as const },
    schema: { type: "string" as const },
};

describe("executeEndpoint computed params", () => {
    test("computed userID uses the configured context resolver", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ input: { params: [computedParam] } });
        await executeEndpoint(endpoint, new Request("http://local/x?user_id=evil"), {
            fetchImpl,
            resolveContext: async () => ({ userID: "user-123" }),
        });
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.example.com/v1/items?user_id=user-123");
    });

    test("computed params without context resolver return 500", async () => {
        const fetchImpl = okFetch();
        const response = await executeEndpoint(
            ep({ input: { params: [computedParam] } }),
            new Request("http://local/x"),
            { fetchImpl },
        );
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("computed params require a configured context resolver");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("required computed userID absent returns 401", async () => {
        const fetchImpl = okFetch();
        const response = await executeEndpoint(
            ep({ input: { params: [computedParam] } }),
            new Request("http://local/x"),
            {
                fetchImpl,
                resolveContext: async () => ({}),
            },
        );
        expect(response.status).toBe(401);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("endpoint with no headers proxies normally", async () => {
        const fetchImpl = okFetch();
        const response = await executeEndpoint(ep({ responseKind: "file" }), new Request("http://local/x"), {
            fetchImpl,
        });
        expect(response.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
