import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import { ep, okFetch } from "./helpers/executeEndpointFixtures";

describe("executeEndpoint secret headers", () => {
    test("secret config header without resolver returns 500", async () => {
        const fetchImpl = okFetch();
        const endpoint = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } }] });
        const response = await executeEndpoint(endpoint, new Request("http://local/x"), { fetchImpl });
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("secret header requires a configured secret store (not wired yet): Authorization");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("secret config header forwards resolved value and prefix", async () => {
        const fetchImpl = okFetch();
        const resolveSecret = mock(async (_ref: string) => "service-role-key");
        const endpoint = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${KEY}", prefix: "Bearer " } }] });
        await executeEndpoint(endpoint, new Request("http://local/x"), { fetchImpl, resolveSecret });
        expect(resolveSecret).toHaveBeenCalledWith("${KEY}");
        expect((fetchImpl.mock.calls[0]![1]!.headers as Headers).get("authorization")).toBe("Bearer service-role-key");
    });

    test("missing secret returns 500 without fetch", async () => {
        const fetchImpl = okFetch();
        const resolveSecret = mock(async (_ref: string) => undefined);
        const endpoint = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${MISSING}" } }] });
        const response = await executeEndpoint(endpoint, new Request("http://local/x"), { fetchImpl, resolveSecret });
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("secret not found: ${MISSING}");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
