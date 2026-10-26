import { expect, test } from "bun:test";
import { createCollectionMaintenanceGuard } from "@bernouy/cms-repository/collections/http";
import { MemorySiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";

test("maintenance permits authenticated recovery transports while ordinary writes stay blocked", async () => {
    const storage = new MemorySiteUpgradeStorage();
    const digest = `sha256:${"a".repeat(64)}`;
    await storage.begin({
        id: digest,
        siteId: "site",
        kind: "collection",
        planDigest: digest,
        sourceStateDigest: digest,
        targetStateDigest: digest,
        expectedRevision: 1,
        createdAt: new Date().toISOString(),
        status: "prepared",
        payload: {},
    });
    const guard = createCollectionMaintenanceGuard({ siteId: "site", upgrades: storage, basePath: "/cms" });
    for (const [path, status] of [
        ["/.cms/query/ulvia.cms.installations/get-operation", 200],
        ["/.cms/mutation/ulvia.cms.installations/resume-contract-upgrade", 200],
        ["/.cms/mutation/ulvia.cms.installations/resume-collection-upgrade", 200],
        ["/.cms/call/ulvia.cms.installations/get-site-upgrade-status", 200],
        ["/.cms/mcp", 200],
        ["/.cms/mutation/ulvia.cms.content/page.update", 423],
        ["/article", 503],
    ] as const) {
        const response = await guard(new Request(`http://cms.test/cms${path}`), async () => new Response("next"));
        expect(response.status).toBe(status);
    }
});
