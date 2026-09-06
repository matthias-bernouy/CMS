import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
installCommerceTestEnvironment();
describe("Commerce delegates mutable legal policy to Consent", () => {
    test("does not expose the removed buyer document sync endpoint", async () => {
        const response = await requestCommerce("/system/buyer-legal-documents/sync", {
            body: {
                configuration: {
                    enabled: true,
                    documents: [{ page: { publishedSnapshotUrl: "https://attacker.test" } }],
                },
            },
        });
        expect(response.status).toBe(404);
        expect(capturedFetches()).toHaveLength(0);
    });
});
