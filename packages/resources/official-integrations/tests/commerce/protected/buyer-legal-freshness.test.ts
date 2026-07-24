import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";
import {
    contentHash,
    legalPage,
    rpcName,
    snapshotResponse,
    snapshotUrl,
    verificationContext,
    versionId,
} from "./buyer-legal-fixtures";

installCommerceTestEnvironment();

describe("buyer legal published-page freshness gate", () => {
    test("passes a newly published snapshot to SQL so the stale accepted version fails closed", async () => {
        const republished = {
            ...legalPage,
            path: "/new-terms",
            content: "<main>Terms revision two</main>",
        };
        setRestResponder((request) => {
            if (request.url === snapshotUrl) {
                return snapshotResponse(republished);
            }
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse(verificationContext());
            }
            if (rpcName(request) === "prepare_protected_payment") {
                return jsonResponse({ message: "conflict: LEGAL_DOCUMENT_VERSION_CHANGED" }, 400);
            }
            return jsonResponse({});
        });

        const response = await prepare([versionId]);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" });
        expect(expectRpc("prepare_protected_payment").body.p_verified_legal_documents).toEqual([
            {
                key: "terms",
                expectedVersionId: versionId,
                contentHash: contentHash(republished),
                page: republished,
            },
        ]);
    });

    test.each([
        ["missing publication", () => jsonResponse({ error: "not found" }, 404)],
        ["redirect", () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } })],
        [
            "wrong schema",
            () => jsonResponse({ schema: "unknown", page: legalPage, contentHash: contentHash(legalPage) }),
        ],
        ["hash mismatch", () => snapshotResponse(legalPage, "a".repeat(64))],
        [
            "oversized response",
            () => snapshotResponse(legalPage, contentHash(legalPage), 200, { "content-length": "20000000" }),
        ],
    ])("rejects a %s before payment preparation", async (_label, responseFactory) => {
        setRestResponder((request) => {
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse(verificationContext());
            }
            if (request.url === snapshotUrl) {
                return responseFactory();
            }
            return jsonResponse({ id: 1 });
        });

        const response = await prepare([versionId]);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_NOT_AVAILABLE" });
        expect(capturedFetches().some((call) => call.url.endsWith("/rpc/prepare_protected_payment"))).toBe(false);
    });

    test("allows a provider-created retry without consulting an unavailable page", async () => {
        setRestResponder((request) => {
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse(verificationContext({ paymentAlreadyCreated: true }));
            }
            if (rpcName(request) === "prepare_protected_payment") {
                return jsonResponse({ paymentAttemptId: 8 });
            }
            return jsonResponse({ error: "must not fetch Delivery" }, 404);
        });

        const response = await prepare([]);

        expect(response.status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_verified_legal_documents).toEqual([]);
        expect(capturedFetches().some((call) => call.url === snapshotUrl)).toBe(false);
    });

    test("does not grant the same bypass to a merely reserved payment attempt", async () => {
        setRestResponder((request) => {
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse(verificationContext({ paymentAlreadyCreated: false }));
            }
            if (request.url === snapshotUrl) {
                return jsonResponse({ error: "not found" }, 404);
            }
            return jsonResponse({});
        });

        const response = await prepare([]);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_NOT_AVAILABLE" });
    });

    test("preserves the disabled historical path without any Delivery fetch", async () => {
        setRestResponder((request) => {
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse({
                    enabled: false,
                    paymentAlreadyCreated: false,
                    documents: [],
                });
            }
            return jsonResponse({ paymentAttemptId: 9 });
        });

        const response = await prepare([]);

        expect(response.status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_verified_legal_documents).toEqual([]);
        expect(capturedFetches()).toHaveLength(2);
    });
});

function prepare(acceptedIds: string[]): Promise<Response> {
    return requestCommerce("/me/order/payment/prepare", {
        userId: "buyer-17",
        body: {
            orderId: 42,
            paymentProvider: "stripe",
            acceptedLegalDocumentVersionIds: acceptedIds,
        },
    });
}
