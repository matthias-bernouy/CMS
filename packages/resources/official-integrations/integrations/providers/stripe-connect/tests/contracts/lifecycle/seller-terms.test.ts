import { afterEach, expect, test } from "bun:test";
import { publishSellerTermsAction } from "../../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/seller-terms.ts";
import { HttpError } from "../../../connectors/supabase/functions/cms-stripe-connect-management/core/runtime.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

test("seller terms require the trusted page resolved for this declared action", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
        calls++;
        throw new Error("No network expected");
    }) as typeof fetch;
    const request = new Request("https://local.test/source-management", { method: "POST" });
    for (const resolvedPages of [{}, { page: { path: "/different", publishedSnapshotUrl: "https://evil.test/" } }]) {
        try {
            await publishSellerTermsAction(request, {
                input: { page: "/terms", publishedSnapshotUrl: "https://evil.test/" },
                resolvedPages,
            });
            throw new Error("Expected rejection");
        } catch (error) {
            expect(error).toBeInstanceOf(HttpError);
            expect((error as HttpError).status).toBe(422);
        }
    }
    expect(calls).toBe(0);
});
