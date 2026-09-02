import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { legalPage, rpcName, verificationContext, versionId } from "./buyer-legal-fixtures";

installCommerceTestEnvironment();

describe("buyer legal snapshot network boundary", () => {
    test("rejects a stored URL outside the approved origin without an outbound request", async () => {
        setRestResponder((request) => {
            if (rpcName(request) === "get_buyer_legal_verification_context") {
                return jsonResponse(
                    verificationContext({
                        documents: [
                            {
                                key: "terms",
                                versionId,
                                pageId: legalPage.id,
                                publishedSnapshotUrl:
                                    "https://attacker.test/.cms/content/published-page-snapshot?id=page-1",
                            },
                        ],
                    }),
                );
            }
            return jsonResponse({});
        });

        expect((await prepare()).status).toBe(409);
        expect(capturedFetches()).toHaveLength(1);
    });

    test("rejects non-loopback plain HTTP even when it is the stored approved origin", async () => {
        const unsafeOrigin = "http://10.0.0.5";
        setRestResponder(() =>
            jsonResponse(
                verificationContext({
                    approvedSnapshotOrigin: unsafeOrigin,
                    documents: [
                        {
                            key: "terms",
                            versionId,
                            pageId: legalPage.id,
                            publishedSnapshotUrl: `${unsafeOrigin}/.cms/content/published-page-snapshot?id=page-1`,
                        },
                    ],
                }),
            ),
        );

        expect((await prepare()).status).toBe(409);
        expect(capturedFetches()).toHaveLength(1);
    });
});

function prepare(): Promise<Response> {
    return requestCommerce("/me/order/payment/prepare", {
        userId: "buyer-17",
        body: {
            orderId: 42,
            paymentProvider: "stripe",
            acceptedLegalDocumentVersionIds: [versionId],
        },
    });
}
