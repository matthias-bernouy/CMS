import { expect, test } from "bun:test";
import { publishedPageContentHash } from "../../../../connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/canonical-page";
import { setActiveFetch } from "../../../runtime/environment";
import { jsonBody, okJson, requestFromFetchInput } from "../../../runtime/http";
import { sourceJsonWithUser, sourceRequestWithUser } from "../../../runtime/source-requests";
import type { CreateAccountSourceScenarioHarness } from "../harness";

export function registerMarketplaceTermsManagementSourceScenario(
    createHarness: CreateAccountSourceScenarioHarness,
): void {
    test("publishes a verified CMS snapshot and rejects a stale administrator revision", async () => {
        const harness = await createHarness();
        const page = {
            id: "seller-terms-page",
            path: "/seller-terms",
            title: "Seller terms",
            description: "Runtime terms",
            content: "<h1>Seller terms</h1><p>Runtime publication.</p>",
        };
        const contentHash = await publishedPageContentHash(page);
        let snapshotFetches = 0;
        setActiveFetch(async (input, init) => {
            const request = requestFromFetchInput(input, init);
            if (request.url.startsWith("https://delivery.example/")) {
                snapshotFetches += 1;
                expect(request.headers.get("authorization")).toBeNull();
                return Response.json({ schema: "cms-published-page-snapshot-v1", page, contentHash });
            }
            return await harness.rest.fetch(request);
        });

        expect(
            await okJson(await sourceJsonWithUser(harness, "system", "listSellerHeldPaymentCapabilities", {})),
        ).toMatchObject({
            readySellerCmsUserIds: [],
            snapshot: "unconfigured",
            snapshotAt: expect.any(String),
        });
        expect(await okJson(await sourceRequestWithUser(harness, "admin-1", "getMarketplaceTermsManagement"))).toEqual({
            status: "unconfigured",
            revision: "new",
            documentKey: "seller_terms",
            label: "",
            consentText: "",
            publishedSnapshotUrl: "",
            page: "",
            updatedAt: null,
        });
        const body = {
            expectedVersion: "new",
            documentKey: "seller_terms",
            label: "Seller terms",
            consentText: "I accept the Seller terms.",
            publishedSnapshotUrl: "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
        };
        const published = await okJson(
            await sourceJsonWithUser(harness, "admin-1", "publishMarketplaceTermsManagement", body),
        );
        expect(published).toMatchObject({
            status: "published",
            documentKey: "seller_terms",
            label: "Seller terms",
            publishedSnapshotUrl: "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
        });
        expect(String(published.revision)).toStartWith("cms-page:");
        expect(published.revision).toBe(harness.rest.currentMarketplaceTermsConfiguration?.version);
        expect(snapshotFetches).toBe(1);
        const managed = await okJson(
            await sourceJsonWithUser(harness, "admin-1", "manageSource", {
                operation: "action",
                actionId: "publish-seller-terms",
                installationId: "stripe-connect",
                input: {
                    ...body,
                    expectedVersion: published.revision,
                    page: "/seller-terms",
                    publishedSnapshotUrl: "https://untrusted.invalid/",
                },
                resolvedPages: { page: { path: "/seller-terms", publishedSnapshotUrl: body.publishedSnapshotUrl } },
            }),
        );
        expect(managed.values).toMatchObject({ status: "published", page: "/seller-terms" });
        expect(snapshotFetches).toBe(2);

        const stale = await sourceJsonWithUser(harness, "admin-2", "publishMarketplaceTermsManagement", body);
        expect(stale.status).toBe(409);
        expect(await jsonBody(stale)).toEqual({ error: "MARKETPLACE_TERMS_VERSION_CHANGED" });
        expect(snapshotFetches).toBe(2);
    });
}
