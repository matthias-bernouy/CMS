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
        const heldPaymentCapabilities = endpoint("listSellerHeldPaymentCapabilities");
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
        expect(heldPaymentCapabilities?.access).toEqual({ mode: "system" });
        expect(heldPaymentCapabilities?.output?.[0]?.body).toMatchObject({
            properties: {
                readySellerCmsUserIds: { type: "array" },
                snapshotAt: { type: "string" },
            },
            required: ["readySellerCmsUserIds", "snapshot", "snapshotAt"],
        });
        expect(sellerRisk?.output?.map((candidate) => candidate.status)).toEqual(["200", "403", "404", "502"]);
        expect(sellerPayout?.input?.body?.properties?.payoutSchedule).toEqual({ type: "string" });
        expect(sellerPayout?.input?.body?.required).toEqual(["userId", "payoutScheduleChangeId"]);

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

    test("masks Stripe provider failures without changing CMS authorization failures", async () => {
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
        const riskUrl = `${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account/risk?userId=seller-1`;
        const cmsHeaders = {
            authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
            "x-cms-user-id": "admin-1",
        };
        const providerRequestsBeforeAuthorization = harness.rest.stripeRequests.length;
        const forbidden = await harness.edgeRequest(
            new Request(riskUrl, {
                headers: {
                    ...cmsHeaders,
                    "x-cms-user-role": "member",
                },
            }),
        );

        expect(forbidden.status).toBe(403);
        expect(await forbidden.json()).toEqual({ error: "the CMS admin role is required" });
        expect(harness.rest.stripeRequests).toHaveLength(providerRequestsBeforeAuthorization);

        harness.rest.failNextAccountRead(403);
        const edgeFailure = await harness.edgeRequest(
            new Request(riskUrl, {
                headers: {
                    ...cmsHeaders,
                    "x-cms-user-role": "admin",
                },
            }),
        );
        const edgeBody = await edgeFailure.json();

        expect(edgeFailure.status).toBe(502);
        expect(edgeBody).toEqual({ error: "provider request failed" });
        expect(JSON.stringify(edgeBody)).not.toContain("sk_test_should_not_leak");
        expect(JSON.stringify(edgeBody)).not.toContain("provider authorization detail");

        harness.rest.failNextAccountRead(403);
        const sourceFailure = await sourceRequestWithUser(harness, "admin-1", "getSellerProviderRisk", {
            userId: "seller-1",
        });
        const sourceBody = await sourceFailure.json();

        expect(sourceFailure.status).toBe(502);
        expect(sourceBody).toEqual({ error: "provider request failed" });
        expect(JSON.stringify(sourceBody)).not.toContain("sk_test_should_not_leak");
        expect(JSON.stringify(sourceBody)).not.toContain("provider authorization detail");
    });

    test("timestamps the seller capability snapshot before provider reconciliation", async () => {
        const harness = await createHarness();
        const response = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/seller-capabilities`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    marketplaceTermsVersion: "terms-v1",
                    marketplaceTermsHash: "a".repeat(64),
                }),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body.snapshotAt).toMatch(
            /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/,
        );
        expect(body).toMatchObject({
            readySellerCmsUserIds: expect.any(Array),
            snapshot: "persisted_provider_projection",
            snapshotAt: expect.any(String),
        });
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
