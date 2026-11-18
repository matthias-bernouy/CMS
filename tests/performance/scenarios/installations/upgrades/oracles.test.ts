import { expect, test } from "bun:test";
import { contractReview, completedUpgrade } from "./oracles";

test("contract upgrade oracles refuse stale selections, grants and incomplete operation results", () => {
    const selections = [
        {
            contractId: "ulvia/cms.content",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
            installationId: "owned",
        },
    ];
    const grants = { default: "allow-selected", denied: [] };
    const review = {
        status: "applicable",
        issueCount: 0,
        issues: [],
        expectedRevision: 2,
        planDigest: `sha256:${"a".repeat(64)}`,
        usageDigest: `sha256:${"b".repeat(64)}`,
        selections,
        source: selections,
        grants,
        authority: { providers: [{}], capabilities: [{}] },
    };
    expect(contractReview(review, selections, grants)).toBe(review);
    for (const changed of [
        { selections: [] },
        { source: [] },
        { grants: { ...grants, denied: [{}] } },
        { status: "blocked" },
        { issueCount: 1 },
        { expectedRevision: -1 },
        { planDigest: "invalid" },
        { usageDigest: "invalid" },
    ]) {
        expect(() => contractReview({ ...review, ...changed }, selections, grants)).toThrow();
    }
    const result = { status: "completed", selectionRevision: 3, upgradeId: `sha256:${"c".repeat(64)}` };
    expect(completedUpgrade(result, 3, result.upgradeId)).toBe(result);
    expect(() => completedUpgrade(result, 4)).toThrow();
    expect(() => completedUpgrade(result, 3, "wrong")).toThrow();
    expect(() => completedUpgrade({ ...result, status: "prepared" }, 3)).toThrow();
});
