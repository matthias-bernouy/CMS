import { expect, test } from "bun:test";
import { collectionReview, completedCollectionUpgrade, assertCollectionReplayConflict } from "./oracles";
import type { Observation } from "../../../harness/clients/types";

test("collection upgrade review refuses a wrong source, changed target and incomplete durable result", () => {
    const oldDigest = `sha256:${"a".repeat(64)}`;
    const target = { collectionId: "performance/owned", version: "1.1.0", digest: `sha256:${"b".repeat(64)}` };
    const before = { revision: 3, digest: oldDigest };
    const review = {
        status: "applicable",
        issueCount: 0,
        issues: [],
        expectedRevision: 3,
        planDigest: `sha256:${"c".repeat(64)}`,
        usageDigest: `sha256:${"d".repeat(64)}`,
        references: [target],
        source: [{ collectionId: target.collectionId, version: "1.0.0", digest: oldDigest }],
        resources: [],
        resourceCount: 0,
    };
    expect(collectionReview(review, target, before)).toBe(review);
    for (const change of [
        { source: [] },
        { references: [] },
        { expectedRevision: 4 },
        { resources: [{}] },
        { issueCount: 1 },
        { planDigest: "invalid" },
        { usageDigest: "invalid" },
    ]) {
        expect(() => collectionReview({ ...review, ...change }, target, before)).toThrow();
    }
    const completed = { status: "completed", collectionRevision: 4, upgradeId: review.planDigest };
    expect(completedCollectionUpgrade(completed, 4, review.planDigest)).toBe(completed);
    expect(() => completedCollectionUpgrade(completed, 3)).toThrow();
    expect(() => completedCollectionUpgrade(completed, 4, "foreign")).toThrow();
    expect(() => completedCollectionUpgrade({ ...completed, status: "prepared" }, 4)).toThrow();
});

test("conflicting recovery replay requires the declared idempotency error and a fully consumed refusal body", () => {
    const refusal: Observation = {
        traceId: "fixture",
        durationMs: 1,
        requestBytes: 1,
        responseBytes: 1,
        status: 200,
        validated: false,
        completed: false,
        streamConsumed: true,
        failure: "mcp-declared-IDEMPOTENCY_CONFLICT",
    };
    expect(() => assertCollectionReplayConflict(refusal, "mcp")).not.toThrow();
    expect(() =>
        assertCollectionReplayConflict({ ...refusal, status: 409, failure: "http-status-409" }, "http"),
    ).not.toThrow();
    for (const change of [
        { failure: "mcp-declared-REVISION_CONFLICT" },
        { streamConsumed: false },
        { validated: true },
        { status: 503 },
    ]) {
        expect(() => assertCollectionReplayConflict({ ...refusal, ...change }, "mcp")).toThrow();
    }
});
