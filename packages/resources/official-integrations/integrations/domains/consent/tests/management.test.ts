import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleConsentRequest } from "../connectors/supabase/functions/cms-consent/handler";
import { publishedPageContentHash } from "../connectors/supabase/functions/cms-consent/core/publishedPages";
const originalDeno = (globalThis as { Deno?: unknown }).Deno;
const originalFetch = globalThis.fetch;
const calls: Request[] = [];
const page = {
    id: "terms-page",
    path: "/terms",
    title: "Terms",
    description: "",
    content: "<main>Published terms</main>",
};
const snapshotUrl = "https://delivery.example/.cms/content/published-page-snapshot?id=terms-page";
const document = { key: "terms", label: "Terms", consentText: "I accept the Terms", enabled: true, page: "/terms" };
const input = { contextKey: "buyer_checkout", enabled: true, expectedRevision: "741:(0,1)", documents: [document] };
const resolvedPages = { "documents.0.page": { ...page, publishedSnapshotUrl: snapshotUrl } };
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
        const request = new Request(resource, init);
        calls.push(request);
        if (request.url === snapshotUrl) {
            return Response.json({
                schema: "cms-published-page-snapshot-v1",
                page,
                contentHash: await publishedPageContentHash(page),
            });
        }
        return Response.json({
            contextKey: "buyer_checkout",
            enabled: true,
            revision: "742:(0,2)",
            documents: [document],
        });
    };
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});
afterAll(() => {
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
});
function management(body: unknown, admin = "admin-42"): Promise<Response> {
    return handleConsentRequest(
        new Request("https://edge.test/cms-consent/management", {
            method: "POST",
            headers: {
                authorization: "Bearer consent-key",
                "content-type": "application/json",
                "x-cms-user-id": admin,
            },
            body: JSON.stringify(body),
        }),
    );
}
describe("Consent settings published page boundary", () => {
    test("publishes the resolved CMS page and optimistic revision, ignoring a browser snapshot URL", async () => {
        const response = await management({
            operation: "save-settings",
            input: { ...input, documents: [{ ...document, publishedSnapshotUrl: "https://attacker.test" }] },
            resolvedPages,
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            values: { contextKey: "buyer_checkout", revision: "742:(0,2)" },
            savedRevision: "742:(0,2)",
            appliedRevision: "742:(0,2)",
        });
        expect(calls.map((call) => call.url)).toEqual([
            snapshotUrl,
            "https://project.supabase.test/rest/v1/rpc/publish_consent_context",
        ]);
        expect(calls[0]!.redirect).toBe("error");
        expect(await calls[1]!.json()).toMatchObject({
            p_context_key: "buyer_checkout",
            p_actor_id: "admin-42",
            p_expected_revision: "741:(0,1)",
            p_documents: [
                { page, contentHash: await publishedPageContentHash(page), publishedSnapshotUrl: snapshotUrl },
            ],
        });
    });
    test.each([undefined, {}, { "documents.0.page": { path: "/other", publishedSnapshotUrl: snapshotUrl } }])(
        "requires a matching trusted resolver selection: %j",
        async (pages) => {
            const response = await management({ operation: "save-settings", input, resolvedPages: pages });
            expect(response.status).toBe(422);
            expect(calls).toHaveLength(0);
        },
    );
    test("requires administrator identity before network work", async () => {
        expect((await management({ operation: "save-settings", input, resolvedPages }, "")).status).toBe(401);
        expect(calls).toHaveLength(0);
    });
    test("preserves revision conflicts and does not report settings as applied", async () => {
        const fetch = globalThis.fetch;
        globalThis.fetch = async (resource, init) =>
            String(resource).includes("/rpc/")
                ? Response.json({ message: "conflict: CONSENT_CONTEXT_REVISION_CHANGED" }, { status: 400 })
                : fetch(resource, init);
        const response = await management({ operation: "save-settings", input, resolvedPages });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "CONSENT_CONTEXT_REVISION_CHANGED" });
    });
    test("disables an existing policy without requiring its page to remain published", async () => {
        const response = await management({ operation: "save-settings", input: { ...input, enabled: false } });
        expect(response.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toEndWith("/rpc/disable_consent_context");
        expect(await calls[0]!.json()).toEqual({
            p_context_key: "buyer_checkout",
            p_actor_id: "admin-42",
            p_expected_revision: "741:(0,1)",
        });
    });
});
