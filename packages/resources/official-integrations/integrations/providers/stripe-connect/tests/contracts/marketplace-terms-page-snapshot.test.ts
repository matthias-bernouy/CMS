import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    publishedPageContentHash,
    serializePublishedPage,
    sha256Hex,
    type PublishedPage,
} from "../../connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/canonical-page";
import { materializePublishedMarketplaceTerms } from "../../connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/snapshot";
import { fetchPublishedMarketplaceTermsPage } from "../../connectors/supabase/functions/cms-stripe-connect-management/core/snapshot-fetch";
import {
    effectiveMarketplaceTermsExpectation,
    type MarketplaceTermsConfiguration,
} from "../../connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/repository";

const integrationRoot = resolve(import.meta.dir, "../../../..");

describe("Stripe Connect marketplace terms published-page evidence", () => {
    test("materializes the exact trusted CMS resolver snapshot without an outbound fetch", async () => {
        const page = legalPage("Version publiée");
        const contentHash = await publishedPageContentHash(page);
        let fetches = 0;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            fetches += 1;
            throw new Error("network access is forbidden while materializing trusted resolver input");
        };

        try {
            const materialized = await materializePublishedMarketplaceTerms({
                ...page,
                publishedSnapshotUrl:
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
            });

            expect(materialized).toEqual({
                page,
                contentHash,
                publishedSnapshotUrl:
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
            });
            expect(contentHash).toBe(await sha256Hex(serializePublishedPage(page)));
            expect(fetches).toBe(0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("fails closed when the trusted resolver payload or its canonical snapshot URL is malformed", async () => {
        const published = legalPage("Version publiée");

        await expect(
            materializePublishedMarketplaceTerms({
                ...published,
                id: "",
                publishedSnapshotUrl:
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
            }),
        ).rejects.toThrow("MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
        await expect(
            materializePublishedMarketplaceTerms({
                ...published,
                publishedSnapshotUrl:
                    "http://169.254.169.254/.cms/content/published-page-snapshot?id=seller-terms-page",
            }),
        ).rejects.toThrow("MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
        await expect(
            materializePublishedMarketplaceTerms({
                ...published,
                publishedSnapshotUrl: "https://delivery.example/.cms/content/published-page-snapshot?id=another-page",
            }),
        ).rejects.toThrow("MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
        await expect(
            materializePublishedMarketplaceTerms({
                ...published,
                publishedSnapshotUrl:
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page&next=/admin",
            }),
        ).rejects.toThrow("MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
    });

    test("downloads and verifies runtime CMS snapshots without forwarding credentials", async () => {
        const page = legalPage("Runtime publication");
        const contentHash = await publishedPageContentHash(page);
        const originalFetch = globalThis.fetch;
        let authorization: string | null = "not-called";
        globalThis.fetch = async (_input, init) => {
            authorization = new Headers(init?.headers).get("authorization");
            return Response.json({ schema: "cms-published-page-snapshot-v1", page, contentHash });
        };
        try {
            expect(
                await fetchPublishedMarketplaceTermsPage(
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
                ),
            ).toEqual({
                ...page,
                publishedSnapshotUrl:
                    "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
            });
            expect(authorization).toBeNull();
            await expect(
                fetchPublishedMarketplaceTermsPage(
                    "https://169.254.169.254/.cms/content/published-page-snapshot?id=seller-terms-page",
                ),
            ).rejects.toThrow("MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("keeps immutable seller evidence while moving publication out of installation answers", async () => {
        const inputs = await artifact("extensions/commerce-stripe-payments/definitions/configuration/inputs.json");
        const afterInstallation = await artifact(
            "extensions/commerce-stripe-payments/definitions/configuration/after-installation.json",
        );
        const schema = await artifact(
            "providers/stripe-connect/connectors/supabase/sql/accounts-and-controls/marketplace-terms-acceptances.sql",
        );
        const acceptance = await artifact(
            "providers/stripe-connect/connectors/supabase/sql/commands/marketplace-terms/record-current-acceptance.sql",
        );
        const immutableEvidence = await artifact(
            "providers/stripe-connect/connectors/supabase/sql/commands/marketplace-terms/immutable-acceptance-trigger.sql",
        );
        const sync = await artifact(
            "providers/stripe-connect/connectors/supabase/sql/commands/marketplace-terms/sync-configuration.sql",
        );
        const enrollment = await artifact(
            "providers/stripe-connect/connectors/supabase/functions/cms-stripe-connect/routes/accounts/enrollment.ts",
        );
        const providerDefinition = await artifact("providers/stripe-connect/definitions/root.json");
        const providerEndpoints = await artifact(
            "providers/stripe-connect/definitions/artifacts/sources/primary/endpoints.json",
        );

        expect(inputs).not.toContain("sellerTermsVersion");
        expect(inputs).not.toContain("sellerTermsHash");
        expect(inputs).not.toContain("sellerTermsDocuments");
        expect(afterInstallation).not.toContain("termsConfiguration");
        expect(afterInstallation).not.toContain("syncMarketplaceTermsConfiguration");
        expect(afterInstallation).toContain('"id": "providerSnapshot"');
        expect(providerDefinition).not.toContain('"artifacts/dashboards/marketplace-terms.json"');
        expect(
            await Bun.file(
                resolve(
                    integrationRoot,
                    "providers/stripe-connect/definitions/artifacts/dashboards/marketplace-terms.json",
                ),
            ).exists(),
        ).toBe(true);
        expect(providerEndpoints).toContain('"endpoints/admin/configuration/marketplace-terms.json"');
        expect(schema).toContain("page_snapshot jsonb not null");
        expect(schema).toContain("terms_version_id uuid");
        expect(schema).toContain("marketplace_terms_acceptances_version_evidence_fkey");
        expect(schema).toContain("foreign key (terms_version_id, terms_version, terms_hash)");
        expect(acceptance).toContain("record_current_marketplace_terms_acceptance");
        expect(acceptance).toContain("v_configuration.current_terms_version_id");
        expect(acceptance).toContain("MARKETPLACE_TERMS_VERSION_CHANGED");
        expect(acceptance).not.toContain("v_version.page_snapshot");
        expect(immutableEvidence).toContain("marketplace_terms_acceptances_immutable");
        expect(sync).toContain("v_terms_version := 'cms-page:' || v_revision_hash");
        expect(enrollment).toContain("recordCurrentMarketplaceTermsAcceptance");
        expect(enrollment).toContain("recordMarketplaceTermsAcceptance");
    });

    test("server configuration overrides stale explicit fields while unconfigured legacy sites remain compatible", () => {
        const legacy = { version: "legacy-v1", hash: "a".repeat(64) };
        const configuredLegacy: MarketplaceTermsConfiguration = {
            mode: "legacy",
            version: "configured-legacy-v2",
            hash: "f".repeat(64),
            updatedAt: "2026-07-25T11:00:00.000Z",
        };
        const published: MarketplaceTermsConfiguration = {
            mode: "published_page",
            version: `cms-page:${"b".repeat(64)}`,
            hash: "c".repeat(64),
            documentKey: "seller_terms",
            label: "Conditions vendeur",
            consentText: "J’accepte les conditions vendeur.",
            page: legalPage("Version publiée"),
            publishedSnapshotUrl: "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
            updatedAt: "2026-07-25T12:00:00.000Z",
        };

        expect(effectiveMarketplaceTermsExpectation(legacy, published)).toEqual({
            version: published.version,
            hash: published.hash,
        });
        expect(effectiveMarketplaceTermsExpectation(legacy, configuredLegacy)).toEqual({
            version: configuredLegacy.version,
            hash: configuredLegacy.hash,
        });
        expect(effectiveMarketplaceTermsExpectation(legacy, null)).toEqual(legacy);
    });
});

function legalPage(content: string): PublishedPage {
    return {
        id: "seller-terms-page",
        path: "/conditions-vendeur",
        title: "Conditions vendeur",
        description: "Conditions applicables aux vendeurs",
        content,
    };
}

async function artifact(path: string): Promise<string> {
    return readFile(resolve(integrationRoot, path), "utf8");
}
