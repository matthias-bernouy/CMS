import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleConsentRequest } from "../connectors/supabase/functions/cms-consent/handler";
const originalDeno = (globalThis as { Deno?: unknown }).Deno;
const originalFetch = globalThis.fetch;
const calls: Request[] = [];
const body = {
    contextKey: "buyer_checkout",
    operationKey: "commerce:payment:stripe:order-42",
    cmsUserId: "buyer-17",
    acceptedVersionIds: ["a".repeat(64)],
    metadata: { orderId: 42 },
};
beforeEach(() => {
    calls.length = 0;
    (globalThis as { Deno?: unknown }).Deno = {
        env: {
            get: (name: string) =>
                ({
                    CMS_CONSENT_API_KEY: "consent-key",
                    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
                    SUPABASE_URL: "https://project.supabase.test",
                })[name],
        },
    };
    globalThis.fetch = async (resource, init) => {
        calls.push(new Request(resource, init));
        return Response.json({ schemaVersion: 1, ...body, acceptanceId: "receipt-42", documents: [] });
    };
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});
afterAll(() => {
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
});
function invoke(path: string, input: unknown, key = "consent-key"): Promise<Response> {
    return handleConsentRequest(
        new Request(`https://edge.test/cms-consent/operations/${path}`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify(input),
        }),
    );
}
describe("Consent operation receipt HTTP contract", () => {
    test("records bounded operation identity, versions and metadata through the backend role", async () => {
        const response = await invoke("accept", body);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            operationKey: body.operationKey,
            cmsUserId: body.cmsUserId,
            acceptanceId: "receipt-42",
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toEndWith("/rpc/record_operation_acceptance");
        expect(calls[0]!.headers.get("apikey")).toBe("sb_secret_test");
        expect(calls[0]!.headers.get("authorization")).toBeNull();
        expect(calls[0]!.headers.get("content-profile")).toBe("consent");
        expect(await calls[0]!.json()).toEqual({
            p_context_key: body.contextKey,
            p_operation_key: body.operationKey,
            p_cms_user_id: body.cmsUserId,
            p_accepted_version_ids: body.acceptedVersionIds,
            p_metadata: body.metadata,
        });
    });
    test("loads a receipt only through its user, operation and context binding", async () => {
        const response = await invoke("receipt", body);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ receipt: { operationKey: body.operationKey } });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toEndWith("/rpc/operation_acceptance_projection");
        expect(await calls[0]!.json()).toEqual({
            p_context_key: body.contextKey,
            p_operation_key: body.operationKey,
            p_cms_user_id: body.cmsUserId,
        });
    });
    test("requires the integration service credential before reading or recording evidence", async () => {
        expect((await invoke("accept", body, "wrong")).status).toBe(401);
        expect((await invoke("receipt", body, "wrong")).status).toBe(401);
        expect(calls).toHaveLength(0);
    });
    test.each([
        { acceptedVersionIds: "a".repeat(64) },
        { metadata: null },
        { metadata: { value: "x".repeat(9000) } },
        { operationKey: "x".repeat(513) },
        { cmsUserId: "" },
    ])("rejects malformed or excessive request data: %j", async (override) => {
        expect((await invoke("accept", { ...body, ...override })).status).toBe(400);
        expect(calls).toHaveLength(0);
    });
    test("retains the exact stale-version conflict reported by the atomic SQL operation", async () => {
        globalThis.fetch = async () =>
            Response.json({ message: "conflict: CONSENT_DOCUMENT_VERSION_CHANGED" }, { status: 400 });
        const response = await invoke("accept", body);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "CONSENT_DOCUMENT_VERSION_CHANGED" });
    });
});
