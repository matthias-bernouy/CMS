import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    publishedPageContentHash,
    serializePublishedPage,
    sha256Hex,
    type PublishedPage,
} from "../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/canonical-page";
import { materializePublishedMarketplaceTerms } from "../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/snapshot";
import {
    effectiveMarketplaceTermsExpectation,
    type MarketplaceTermsConfiguration,
} from "../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/routes/accounts/marketplace-terms/repository";

const integrationRoot = resolve(import.meta.dir, "../../../integrations");

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

    test("keeps legacy installations while adding page-link sync and immutable snapshot proof", async () => {
        const inputs = await artifact(
            "extensions/commerce-stripe-payments/versions/1.0.0/definitions/configuration/inputs.json",
        );
        const afterInstallation = await artifact(
            "extensions/commerce-stripe-payments/versions/1.0.0/definitions/configuration/after-installation.json",
        );
        const schema = await artifact(
            "providers/stripe-connect/versions/1.0.0/connectors/supabase/sql/accounts-and-controls/marketplace-terms-acceptances.sql",
        );
        const acceptance = await artifact(
            "providers/stripe-connect/versions/1.0.0/connectors/supabase/sql/commands/marketplace-terms/record-current-acceptance.sql",
        );
        const immutableEvidence = await artifact(
            "providers/stripe-connect/versions/1.0.0/connectors/supabase/sql/commands/marketplace-terms/immutable-acceptance-trigger.sql",
        );
        const sync = await artifact(
            "providers/stripe-connect/versions/1.0.0/connectors/supabase/sql/commands/marketplace-terms/sync-configuration.sql",
        );
        const enrollment = await artifact(
            "providers/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/routes/accounts/enrollment.ts",
        );

        expect(inputs).toContain('"name": "sellerTermsVersion"');
        expect(inputs).toContain('"name": "sellerTermsHash"');
        expect(inputs).toContain('"name": "sellerTermsDocuments"');
        expect(inputs).toContain('"type": "page-link"');
        expect(inputs.match(/"name": "sellerTerms(?:Version|Hash)"[\s\S]*?"required": true/g)).toHaveLength(2);
        expect(afterInstallation.indexOf('"id": "termsConfiguration"')).toBeLessThan(
            afterInstallation.indexOf('"id": "providerSnapshot"'),
        );
        expect(afterInstallation).toContain('"endpoint": "syncMarketplaceTermsConfiguration"');
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
