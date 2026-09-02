import { expect, test } from "bun:test";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJsonWithUser, sourceRequestWithUser } from "../../runtime/source-requests";
import type { JsonRecord } from "../../runtime/types";
import type { CreateAccountSourceScenarioHarness } from "./harness";

const staleVersion = "legacy-client-seller-terms";
const staleHash = "a".repeat(64);
const currentVersion = `cms-page:${"b".repeat(64)}`;
const currentHash = "c".repeat(64);

export function registerMarketplaceTermsAuthoritySourceScenario(
    createHarness: CreateAccountSourceScenarioHarness,
): void {
    test("keeps the published seller terms authoritative over stale explicit values across enrollment, status, and protected eligibility", async () => {
        const harness = await createHarness();
        harness.rest.setCurrentMarketplaceTermsConfiguration(publishedConfiguration());

        const enrolled = await okJson(
            await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: staleVersion,
                marketplaceTermsHash: staleHash,
                expectedMarketplaceTermsVersion: currentVersion,
                expectedMarketplaceTermsHash: currentHash,
            }),
        );
        expect(enrolled).toMatchObject({
            marketplaceTermsCurrentVersionAccepted: true,
            marketplaceTermsRequirement: {
                mode: "published_page",
                version: currentVersion,
                hash: currentHash,
                label: "Conditions vendeur",
                consentText: "J’accepte les conditions vendeur publiées.",
                page: { path: "/conditions-vendeur" },
            },
        });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toEqual([
            expect.objectContaining({
                cms_user_id: "seller-1",
                terms_version: currentVersion,
                terms_hash: currentHash,
                terms_version_id: "terms-version-current",
            }),
        ]);
        expect(harness.rest.rows("marketplace_terms_acceptances")).not.toEqual([
            expect.objectContaining({ terms_version: staleVersion }),
        ]);

        const status = await okJson(
            await sourceRequestWithUser(harness, "seller-1", "getConnectStatus", {
                marketplaceTermsVersion: staleVersion,
                marketplaceTermsHash: staleHash,
            }),
        );
        expect(status.marketplaceTermsCurrentVersionAccepted).toBeTrue();

        const eligibility = await okJson(
            await sourceJsonWithUser(harness, "buyer-1", "checkSellerHeldPaymentEligibility", {
                sellerUserId: "seller-1",
                marketplaceTermsVersion: staleVersion,
                marketplaceTermsHash: staleHash,
            }),
        );
        expect(eligibility).toEqual({ eligible: true, reasonCode: "eligible" });

        harness.rest.setCurrentMarketplaceTermsConfiguration(
            publishedConfiguration({
                termsVersionId: "terms-version-next",
                version: `cms-page:${"d".repeat(64)}`,
                hash: "e".repeat(64),
                page: {
                    id: "seller-terms-page",
                    path: "/conditions-vendeur",
                    title: "Conditions vendeur",
                    description: "Conditions applicables aux vendeurs",
                    content: "Conditions vendeur renouvelées.",
                },
            }),
        );
        const renewedStatus = await okJson(
            await sourceRequestWithUser(harness, "seller-1", "getConnectStatus", {
                marketplaceTermsVersion: currentVersion,
                marketplaceTermsHash: currentHash,
            }),
        );
        expect(renewedStatus.marketplaceTermsCurrentVersionAccepted).toBeFalse();
        expect(renewedStatus.marketplaceTermsRequirement).toMatchObject({
            mode: "published_page",
            version: `cms-page:${"d".repeat(64)}`,
            hash: "e".repeat(64),
            page: { path: "/conditions-vendeur" },
        });
        const staleAcceptance = await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: currentVersion,
            marketplaceTermsHash: currentHash,
            expectedMarketplaceTermsVersion: currentVersion,
            expectedMarketplaceTermsHash: currentHash,
        });
        expect(staleAcceptance.status).toBe(409);
        expect(await jsonBody(staleAcceptance)).toEqual({ error: "MARKETPLACE_TERMS_VERSION_CHANGED" });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toHaveLength(1);
        const renewedEligibility = await sourceJsonWithUser(harness, "buyer-1", "checkSellerHeldPaymentEligibility", {
            sellerUserId: "seller-1",
            marketplaceTermsVersion: currentVersion,
            marketplaceTermsHash: currentHash,
        });
        expect(renewedEligibility.status).toBe(200);
        expect(await jsonBody(renewedEligibility)).toEqual({
            eligible: false,
            reasonCode: "seller_terms_not_current",
        });
    });
}

function publishedConfiguration(patch: JsonRecord = {}): JsonRecord {
    return {
        mode: "published_page",
        termsVersionId: "terms-version-current",
        version: currentVersion,
        hash: currentHash,
        documentKey: "seller_terms",
        label: "Conditions vendeur",
        consentText: "J’accepte les conditions vendeur publiées.",
        page: {
            id: "seller-terms-page",
            path: "/conditions-vendeur",
            title: "Conditions vendeur",
            description: "Conditions applicables aux vendeurs",
            content: "Conditions vendeur publiées.",
        },
        publishedSnapshotUrl: "https://delivery.example/.cms/content/published-page-snapshot?id=seller-terms-page",
        updatedAt: "2026-07-25T12:00:00.000Z",
        ...patch,
    };
}
