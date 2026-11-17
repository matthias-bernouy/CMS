import { createHash } from "node:crypto";
import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import type { InitializationReview } from "@bernouy/repository/collections/installations";
import type { Dataset } from "./datasets";
import type { InitializationFixture } from "./fixture";

const digest = (value: unknown) => `sha256:${createHash("sha256").update(canonicalizeIJson(value)).digest("hex")}`;

export function assertInitializationReview(
    output: unknown,
    fixture: {
        site: Pick<InitializationFixture["site"], "instanceId">;
        main: Pick<InitializationFixture["main"], "subjectId">;
    },
    dataset: Dataset,
) {
    const response = requireRecord(output);
    assertCondition(typeof response.reviewJson === "string");
    const review = parseStrictJson(response.reviewJson, 1024 * 1024, 64) as InitializationReview;
    assertCondition(
        review.instanceId === fixture.site.instanceId &&
            review.siteId === "default" &&
            review.actorId === fixture.main.subjectId,
    );
    assertCondition(
        Number.isSafeInteger(review.expectedRevision) &&
            Number.isSafeInteger(review.systemRevision) &&
            Number.isSafeInteger(review.collectionRevision),
    );
    assertCondition(review.plan.protocol === "ulvia-initialization-plan/v1" && review.plan.locale === "en");
    assertCondition(canonicalizeIJson(review.plan.root) === canonicalizeIJson(dataset.root));
    assertCondition(
        review.plan.collections.length === dataset.collections && review.plan.pages.length === dataset.paths.length,
    );
    assertCondition(
        canonicalizeIJson(review.plan.pages.map((page) => page.path).toSorted()) ===
            canonicalizeIJson(dataset.paths.toSorted()),
    );
    assertCondition(new Set(review.plan.pages.map((page) => page.receiptId)).size === dataset.paths.length);
    for (const page of review.plan.pages) {
        const expected = dataset.pages?.find(({ path }) => path === page.path);
        assertCondition(
            page.title === (expected?.title ?? "MCP kit") &&
                page.description === (expected?.description ?? "Panel") &&
                page.visible === (expected?.visible ?? true) &&
                page.indexing === (expected?.indexing ?? false) &&
                page.systemRole === expected?.systemRole,
        );
    }
    const { digest: reviewDigest, ...evidence } = review;
    const { digest: planDigest, ...plan } = review.plan;
    assertCondition(
        response.planDigest === reviewDigest && reviewDigest === digest(evidence) && planDigest === digest(plan),
    );
    return review;
}
