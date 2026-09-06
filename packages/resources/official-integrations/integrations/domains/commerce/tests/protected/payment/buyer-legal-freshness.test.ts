import { describe, expect, test } from "bun:test";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, jsonResponse } from "../../harness";
import {
    consentContext,
    consentDocument,
    consentReceipt,
    consentResponder,
    consentUrl,
    nextVersionId,
    prepare,
    versionId,
} from "./buyer-legal-fixtures";
installCommerceTestEnvironment();
describe("Commerce Consent freshness and retry boundary", () => {
    test.each([{ ids: [] }, { ids: [nextVersionId] }, { ids: [versionId, nextVersionId] }])(
        "requires exactly the current document revisions: %j",
        async ({ ids }) => {
            consentResponder();
            const response = await prepare(ids);
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" });
            expect(
                capturedFetches().some(
                    (call) =>
                        call.url.endsWith("/operations/accept") || call.url.endsWith("/rpc/prepare_protected_payment"),
                ),
            ).toBe(false);
        },
    );
    test("rejects a policy revision changed between display and submission", async () => {
        consentResponder((request) =>
            request.url.includes("/requirements?")
                ? jsonResponse({ enabled: true, documents: [{ ...consentDocument, versionId: nextVersionId }] })
                : undefined,
        );
        expect((await prepare()).status).toBe(409);
        expect(capturedFetches()).toHaveLength(3);
    });
    test("maps a version race during Consent recording and never prepares payment", async () => {
        consentResponder((request) =>
            request.url.endsWith("/operations/accept")
                ? jsonResponse({ error: "CONSENT_DOCUMENT_VERSION_CHANGED" }, 409)
                : undefined,
        );
        const response = await prepare();
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" });
        expect(capturedFetches().some((call) => call.url.endsWith("/rpc/prepare_protected_payment"))).toBe(false);
    });
    test("reuses the operation receipt across policy publication and preserves immutable evidence", async () => {
        consentResponder((request) =>
            request.url.endsWith("/operations/receipt") ? jsonResponse({ receipt: consentReceipt() }) : undefined,
        );
        const response = await prepare([]);
        expect(response.status).toBe(200);
        expect(capturedFetches().some((call) => call.url.includes("/requirements?"))).toBe(false);
        expect(
            capturedFetches().find((call) => call.url === `${consentUrl}/operations/accept`)?.body.acceptedVersionIds,
        ).toEqual([]);
        expect(expectRpc("prepare_protected_payment").body.p_consent_receipts).toEqual([consentReceipt()]);
    });
    test("allows the SQL-authorized provider-created retry without contacting Consent", async () => {
        consentResponder((request) =>
            request.url.endsWith("/rpc/get_buyer_consent_context")
                ? jsonResponse(consentContext({ requiresConsent: false }))
                : undefined,
        );
        expect((await prepare([])).status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_consent_receipts).toEqual([]);
        expect(capturedFetches()).toHaveLength(2);
    });
    test("requires Consent for a reserved attempt and blocks if the service is unavailable", async () => {
        consentResponder((request) =>
            request.url.startsWith(consentUrl) ? jsonResponse({ error: "unavailable" }, 503) : undefined,
        );
        const response = await prepare([]);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "CONSENT_UNAVAILABLE" });
        expect(capturedFetches()).toHaveLength(2);
    });
    test("records a disabled context receipt instead of bypassing policy resolution", async () => {
        const disabled = consentReceipt({ required: false, documents: [], acceptanceId: null });
        consentResponder((request) =>
            request.url.includes("/requirements?")
                ? jsonResponse({ enabled: false, documents: [] })
                : request.url.endsWith("/operations/accept")
                  ? jsonResponse(disabled)
                  : undefined,
        );
        expect((await prepare([])).status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_consent_receipts).toEqual([disabled]);
        expect(capturedFetches().filter((call) => call.url.startsWith(consentUrl))).toHaveLength(3);
    });
});
