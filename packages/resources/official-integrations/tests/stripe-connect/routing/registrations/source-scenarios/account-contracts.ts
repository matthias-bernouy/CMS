import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { activeEnv } from "../../../runtime/environment";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequestWithRole, sourceRequestWithUser } from "../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerAccountContractSourceScenarios(createHarness: CreateHarness): void {
    test("does not expose arbitrary Connect account lookup to anonymous or support callers", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:stripe-connect");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).not.toContain("urn:stripe-connect:getConnectAccount");
        expect(
            source?.endpoints.find((endpoint) => endpoint.urn === "urn:stripe-connect:submitConnectVerification")
                ?.timeoutMs,
        ).toBe(60_000);

        const endpoint = (id: string) =>
            source?.endpoints.find((candidate) => candidate.urn === `urn:stripe-connect:${id}`);
        const protectedPayment = endpoint("createProtectedPayment");
        const heldPaymentEligibility = endpoint("checkSellerHeldPaymentEligibility");
        const sellerRisk = endpoint("getSellerProviderRisk");
        const sellerPayout = endpoint("configureSellerPayoutSchedule");
        const reconciliationPaymentOutput =
            endpoint("runProviderReconciliation")?.output?.[0]?.body?.properties?.payments?.items;
        const enrollment = endpoint("enrollConnectSeller");
        const protectedPaymentOutput = protectedPayment?.output?.[0]?.body;
        const protectedPaymentRead = endpoint("getProtectedPayment");
        const protectedPaymentReference = endpoint("getProtectedPaymentByClientReference");
        const protectedPaymentReadOutput = protectedPaymentRead?.output?.[0]?.body;
        const protectedPaymentReferenceOutput = protectedPaymentReference?.output?.[0]?.body;
        expect(enrollment?.timeoutMs).toBe(60_000);
        expect(reconciliationPaymentOutput?.properties?.commercePaymentStatus).toEqual({ type: "string" });
        expect(reconciliationPaymentOutput?.required).toContain("commercePaymentStatus");
        expect(protectedPaymentReadOutput?.properties?.reconciliationPending).toEqual({ type: "boolean" });
        expect(protectedPaymentReferenceOutput?.properties?.payment?.properties?.reconciliationPending).toEqual({
            type: "boolean",
        });
        expect(protectedPaymentRead?.access).toEqual({ mode: "system" });
        expect(protectedPaymentReference?.access).toEqual({ mode: "system" });
        expect(enrollment?.input?.body?.required ?? []).toEqual([]);
        expect(Object.keys(enrollment?.input?.body?.properties ?? {})).toEqual([
            "accountToken",
            "contactEmail",
            "marketplaceTermsAccepted",
            "marketplaceTermsVersion",
            "marketplaceTermsHash",
        ]);
        expect(endpoint("getConnectStatus")?.input?.params?.map((param) => param.name)).toEqual([
            "marketplaceTermsVersion",
            "marketplaceTermsHash",
        ]);
        expect(endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.marketplaceTermsAcceptedAt).toEqual({
            type: "string",
            nullable: true,
        });
        expect(endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.stripeAccountId).toEqual({
            type: "string",
            nullable: true,
        });
        expect([
            protectedPayment?.input?.body?.properties?.sellerUserId?.semantic?.authority,
            heldPaymentEligibility?.input?.body?.properties?.sellerUserId?.semantic?.authority,
            sellerRisk?.input?.params?.[0]?.schema?.semantic?.authority,
            sellerPayout?.input?.body?.properties?.userId?.semantic?.authority,
            endpoint("createConnectOnboardingLinkForUser")?.input?.params?.[0]?.schema?.semantic?.authority,
            endpoint("createConnectOnboardingSessionForUser")?.input?.params?.[0]?.schema?.semantic?.authority,
            endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.userId?.semantic?.authority,
            endpoint("enrollConnectSeller")?.output?.[0]?.body?.properties?.userId?.semantic?.authority,
            protectedPaymentOutput?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentOutput?.properties?.sellerUserId?.semantic?.authority,
            protectedPaymentReadOutput?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentReadOutput?.properties?.sellerUserId?.semantic?.authority,
            protectedPaymentReferenceOutput?.properties?.payment?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentReferenceOutput?.properties?.payment?.properties?.sellerUserId?.semantic?.authority,
            sellerRisk?.output?.[0]?.body?.properties?.account?.properties?.userId?.semantic?.authority,
            sellerPayout?.output?.[0]?.body?.properties?.account?.properties?.userId?.semantic?.authority,
        ]).toEqual(Array(16).fill("cms"));
        expect(heldPaymentEligibility?.access).toEqual({ mode: "system" });
        expect(heldPaymentEligibility?.output?.[0]?.body).toMatchObject({
            type: "object",
            properties: { eligible: { type: "boolean" }, reasonCode: { type: "string" } },
            required: ["eligible", "reasonCode"],
        });

        const anonymousSourceLookup = await sourceRequestWithRole(harness, "", undefined, "getConnectAccount", {
            userId: "seller-1",
        });
        const anonymousEdgeLookup = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account?userId=seller-1`),
        );
        const supportEdgeLookup = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account?userId=seller-1`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                    "x-cms-user-id": "support-1",
                    "x-cms-user-role": "support",
                },
            }),
        );

        expect(anonymousSourceLookup.status).toBe(404);
        expect(anonymousEdgeLookup.status).toBe(404);
        expect(supportEdgeLookup.status).toBe(404);
    });

    test("projects nullable status fields for an existing seller account", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );

        harness.rest.setAccountState("seller-1", { marketplace_terms_accepted_at: null });
        const termsPending = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"));
        expect(termsPending).toMatchObject({
            exists: true,
            connected: true,
            stripeAccountId: expect.any(String),
            marketplaceTermsAcceptedAt: null,
        });

        harness.rest.setAccountState("seller-1", { stripe_account_id: null });
        const accountPending = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"));
        expect(accountPending).toMatchObject({
            exists: true,
            connected: false,
            stripeAccountId: null,
            marketplaceTermsAcceptedAt: null,
        });
    });
}
