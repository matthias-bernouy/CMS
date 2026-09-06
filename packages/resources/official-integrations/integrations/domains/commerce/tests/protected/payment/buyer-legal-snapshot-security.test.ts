import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce, jsonResponse } from "../../harness";
import { consentReceipt, consentResponder, consentUrl, prepare } from "./buyer-legal-fixtures";
installCommerceTestEnvironment();
describe("Commerce Consent service boundary", () => {
    test.each([
        ["redirect", () => new Response(null, { status: 302, headers: { location: "https://attacker.test" } })],
        ["unauthorized", () => jsonResponse({ error: "unauthorized" }, 401)],
        ["invalid JSON", () => new Response("not json")],
        ["non-object JSON", () => jsonResponse([])],
        ["oversized JSON", () => jsonResponse({ value: "a".repeat(1_048_576) })],
    ])("fails closed on %s from Consent", async (_label, factory) => {
        consentResponder((request) => (request.url.startsWith(consentUrl) ? factory() : undefined));
        const response = await prepare();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "CONSENT_UNAVAILABLE" });
        expect(capturedFetches()).toHaveLength(2);
        expect(capturedFetches()[1]!.redirect).toBe("error");
    });
    test.each([
        { operationKey: "commerce:payment:stripe:other-order" },
        { cmsUserId: "another-buyer" },
        { contextKey: "signup" },
    ])("rejects a service receipt with mismatching ownership or operation: %j", async (override) => {
        consentResponder((request) =>
            request.url.endsWith("/operations/accept") ? jsonResponse(consentReceipt(override)) : undefined,
        );
        const response = await prepare();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "CONSENT_UNAVAILABLE" });
        expect(capturedFetches().some((call) => call.url.endsWith("/rpc/prepare_protected_payment"))).toBe(false);
    });
    test("does not accept a browser receipt when no documents were accepted", async () => {
        consentResponder();
        expect(
            (await prepare([], { consentReceipts: [consentReceipt()], acceptedReceipts: [consentReceipt()] })).status,
        ).toBe(409);
        expect(capturedFetches()).toHaveLength(3);
    });
});

describe("Commerce Consent audit receipt resolution", () => {
    test("resolves linked immutable snapshots from Consent while preserving historical evidence", async () => {
        const receipt = consentReceipt();
        consentResponder((request) =>
            request.url.endsWith("/rpc/get_buyer_legal_acceptance_audit")
                ? jsonResponse({
                      orderId: 42,
                      buyerCmsUserId: "buyer-17",
                      acceptances: [{ key: "historical-terms" }],
                      consentReferences: [
                          {
                              contextKey: receipt.contextKey,
                              operationKey: receipt.operationKey,
                              acceptanceId: receipt.acceptanceId,
                              correlationId: "correlation-42",
                          },
                      ],
                  })
                : request.url.endsWith("/operations/receipt")
                  ? jsonResponse({ receipt })
                  : undefined,
        );
        const response = await requestCommerce("/me/order/legal-acceptances?orderId=42", { userId: "buyer-17" });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: 42,
            buyerCmsUserId: "buyer-17",
            acceptances: [
                { key: "historical-terms" },
                {
                    ...(receipt.documents as Record<string, unknown>[])[0],
                    key: "terms",
                    acceptanceId: receipt.acceptanceId,
                    contextKey: receipt.contextKey,
                    acceptedAt: receipt.acceptedAt,
                    correlationId: "correlation-42",
                },
            ],
        });
        expect(capturedFetches()).toHaveLength(2);
        expect(capturedFetches()[1]!.body).toEqual({
            contextKey: receipt.contextKey,
            operationKey: receipt.operationKey,
            cmsUserId: "buyer-17",
        });
    });
    test("rejects an audit receipt whose acceptance id differs from the stored link", async () => {
        consentResponder((request) =>
            request.url.endsWith("/rpc/get_buyer_legal_acceptance_audit")
                ? jsonResponse({
                      buyerCmsUserId: "buyer-17",
                      consentReferences: [
                          {
                              contextKey: "buyer_checkout",
                              operationKey: "payment-42",
                              acceptanceId: "expected-acceptance",
                          },
                      ],
                  })
                : request.url.endsWith("/operations/receipt")
                  ? jsonResponse({ receipt: consentReceipt() })
                  : undefined,
        );
        const response = await requestCommerce("/me/order/legal-acceptances?orderId=42", { userId: "buyer-17" });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "CONSENT_UNAVAILABLE" });
    });
});
