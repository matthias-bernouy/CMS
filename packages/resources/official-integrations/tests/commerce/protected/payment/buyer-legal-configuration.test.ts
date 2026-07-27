import { describe, expect, test } from "bun:test";
import { capturedFetches, expectSingleRpc, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { deliveryOrigin, legalPage, snapshotUrl } from "./buyer-legal-fixtures";

installCommerceTestEnvironment();

describe("buyer legal configuration sync", () => {
    test("syncs a canonical CMS snapshot and its server-derived origin", async () => {
        const configuration = JSON.stringify({
            enabled: true,
            documents: [
                {
                    key: "terms",
                    enabled: true,
                    label: "Terms",
                    consentText: "I accept the terms",
                    contexts: ["buyer_checkout"],
                    page: { ...legalPage, publishedSnapshotUrl: snapshotUrl },
                },
            ],
        });
        const response = await requestCommerce("/system/buyer-legal-documents/sync", {
            body: { configuration },
            userRole: null,
        });

        expect(response.status).toBe(200);
        const call = expectSingleRpc("sync_buyer_legal_documents");
        expect(call.body).toMatchObject({
            p_enabled: true,
            p_snapshot_origin: deliveryOrigin,
            p_actor_id: "cms-integration-sync",
        });
        expect(call.body.p_documents).toEqual([
            expect.objectContaining({
                key: "terms",
                page: {
                    ...legalPage,
                    contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                    publishedSnapshotUrl: snapshotUrl,
                },
            }),
        ]);
        expect(call.headers.get("x-cms-user-id")).toBeNull();
    });

    test("rejects non-canonical or caller-selected snapshot configuration", async () => {
        const invalidContent = await requestCommerce("/system/buyer-legal-documents/sync", {
            body: {
                enabled: true,
                documents: [documentWith({ content: { type: "page" } })],
            },
            userRole: null,
        });
        expect(invalidContent.status).toBe(422);

        const unsafeUrl = await requestCommerce("/system/buyer-legal-documents/sync", {
            body: {
                enabled: true,
                documents: [
                    documentWith({
                        publishedSnapshotUrl: "http://169.254.169.254/.cms/content/published-page-snapshot?id=page-1",
                    }),
                ],
            },
            userRole: null,
        });
        expect(unsafeUrl.status).toBe(422);
        expect(capturedFetches()).toHaveLength(0);
    });
});

function documentWith(pageOverrides: Record<string, unknown>) {
    return {
        key: "terms",
        label: "Terms",
        consentText: "I accept the terms",
        contexts: ["buyer_checkout"],
        page: { ...legalPage, publishedSnapshotUrl: snapshotUrl, ...pageOverrides },
    };
}
