import { describe, expect, test } from "bun:test";
import { observedAt, providerUrl, rawToken, tokenHash, useLabelScenario, type JsonRecord } from "./harness";

describe("Mondial Relay protected label contract", () => {
    test("preserves the exact PDF body, headers, and single provider fetch", async () => {
        const harness = await useLabelScenario();
        const response = await harness.request({ token: rawToken, seller: "seller-42" });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("%PDF-1.7 exact-label");
        expect(Object.fromEntries(response.headers)).toEqual({
            "cache-control": "private, no-store",
            "content-disposition": 'attachment; filename="mondial-relay-12345678.pdf"',
            "content-type": "application/pdf",
            "x-content-type-options": "nosniff",
        });
        expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([
            expect.objectContaining({
                kind: "provider",
                method: "GET",
                url: providerUrl,
                redirect: "manual",
                headers: {},
            }),
        ]);
    });

    test("uses one bounded context RPC before the unchanged provider fetch", async () => {
        const harness = await useLabelScenario();
        const response = await harness.request({ token: rawToken, seller: "seller-42" });
        expect(response.status).toBe(200);

        expect(harness.calls.map(({ kind, method, pathname }) => [kind, method, pathname])).toEqual([
            ["database", "POST", "/rest/v1/rpc/get_label_access_context"],
            ["provider", "GET", "/labels/exact.pdf"],
        ]);
        expect(harness.calls[0]).toMatchObject({
            body: {
                p_token_hash: tokenHash,
                p_seller_cms_user_id: "seller-42",
                p_observed_at: observedAt,
            },
        });
    });

    test("preserves nullable and empty expedition numbers in successful label contexts", async () => {
        for (const [expeditionNumber, filename] of [
            [null, "mondial-relay-label.pdf"],
            ["", "mondial-relay-.pdf"],
        ] as const) {
            const harness = await useLabelScenario({
                shipment: {
                    expedition_number: expeditionNumber,
                    label_url: providerUrl,
                },
            });
            const response = await harness.request({ token: rawToken, seller: "seller-42" });

            expect(response.status).toBe(200);
            expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${filename}"`);
            expect(harness.calls.map(({ kind }) => kind)).toEqual(["database", "provider"]);
        }
    });

    test("keeps authentication and local validation ahead of database and provider work", async () => {
        const harness = await useLabelScenario();
        const cases = [
            [{ token: rawToken, seller: "seller-42", authorization: null }, 401, { error: "unauthorized" }],
            [{ token: rawToken, seller: "seller-42", authorization: "Bearer wrong" }, 401, { error: "unauthorized" }],
            [{ seller: "seller-42" }, 400, { error: "token is required" }],
            [{ token: rawToken }, 401, { error: "a seller-bound label token is required" }],
        ] as const;

        for (const [request, status, body] of cases) {
            const start = harness.calls.length;
            const response = await harness.request(request);
            expect([response.status, await response.json()]).toEqual([status, body]);
            expect(harness.calls.slice(start)).toEqual([]);
        }
    });

    test("preserves provider rejection mapping without redirects or retries", async () => {
        for (const [provider, error] of [
            ["redirect", "Mondial Relay label redirects are not allowed"],
            ["missing", "unable to fetch Mondial Relay label"],
            ["html", "Mondial Relay label response is not a PDF"],
        ] as const) {
            const harness = await useLabelScenario({ provider });
            const response = await harness.request({ token: rawToken, seller: "seller-42" });
            expect([response.status, await response.json()]).toEqual([502, { error }]);
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toHaveLength(1);
            expect(harness.calls.at(-1)).toMatchObject({ kind: "provider", redirect: "manual" });
        }
    });

    test("fails closed before the provider for malformed context RPC responses", async () => {
        const malformed: unknown[] = [
            null,
            [],
            {},
            { state: "unknown" },
            { state: "ok" },
            { state: "ok", shipment: { expedition_number: "12345678" } },
            { state: "not_found", shipment: { expedition_number: "12345678", label_url: providerUrl } },
            {
                state: "ok",
                shipment: {
                    expedition_number: "12345678",
                    label_url: providerUrl,
                    recipient_email: "must-not-cross-the-boundary@example.test",
                },
            },
        ];
        for (const rpcResponse of malformed) {
            const harness = await useLabelScenario({ rpcResponse });
            const response = await harness.request({ token: rawToken, seller: "seller-42" });
            expect(response.status).toBe(502);
            expect((await response.json()) as JsonRecord).toEqual({
                error: "get_label_access_context returned an invalid response",
            });
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([]);
        }
    });
});
