import { identifyReviewedSchemaBaseline, type ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import type { OfficialRepositoryBootstrapPlanProjection } from "../../../../../interfaces/publication";
import type { ReviewedSchemaBaselineHistory } from "../../../../../interfaces/reportStore";
import type { ReviewedSchemaBaselineStore } from "../../../../../interfaces/reportStore";

export async function preflightStoredBootstrapBaselines(
    store: ReviewedSchemaBaselineStore,
    plan: OfficialRepositoryBootstrapPlanProjection,
    existingKinds: ReadonlySet<string>,
): Promise<void> {
    const expectedByPackage = new Map<string, ReviewedSchemaBaselineV1[]>();
    const expectedByKey = new Map<string, ReviewedSchemaBaselineV1>();
    for (const baseline of plan.reviewedSchemaBaselines) {
        const identity = packageIdentity(baseline.kind, baseline.version, baseline.packageDigest);
        expectedByPackage.set(identity, [...(expectedByPackage.get(identity) ?? []), baseline]);
        expectedByKey.set(baselineIdentity(baseline), baseline);
    }
    const allHistories = await store.listAll();
    for (const history of allHistories) {
        const expected = expectedByKey.get(baselineIdentity(history.current));
        if (!expected) {
            throw new TypeError("Official bootstrap baseline store contains state outside the exact plan");
        }
        await assertExactStoredBaselines([history], [expected]);
    }
    for (const entry of plan.packages) {
        const { kind, version } = entry.package.envelope;
        const expected = expectedByPackage.get(packageIdentity(kind, version, entry.package.digest)) ?? [];
        const histories = allHistories.filter(
            (history) =>
                history.logicalKey.kind === kind &&
                history.logicalKey.version === version &&
                history.logicalKey.packageDigest === entry.package.digest,
        );
        if (histories.length > 0 && !existingKinds.has(kind)) {
            throw new TypeError("Official bootstrap baseline exists before its exact package is live");
        }
        await assertExactStoredBaselines(histories, expected);
    }
}

export async function assertCompleteStoredBootstrapBaselines(
    store: ReviewedSchemaBaselineStore,
    plan: OfficialRepositoryBootstrapPlanProjection,
): Promise<void> {
    const histories = await store.listAll();
    if (histories.length !== plan.reviewedSchemaBaselines.length) {
        throw new Error("Official bootstrap did not persist every exact reviewed schema baseline");
    }
    const expectedByKey = new Map(
        plan.reviewedSchemaBaselines.map((baseline) => [baselineIdentity(baseline), baseline]),
    );
    for (const history of histories) {
        const expected = expectedByKey.get(baselineIdentity(history.current));
        if (!expected) {
            throw new Error("Official bootstrap persisted reviewed schema baseline state outside the exact plan");
        }
        await assertExactStoredBaselines([history], [expected]);
    }
}

async function assertExactStoredBaselines(
    histories: readonly ReviewedSchemaBaselineHistory[],
    expected: readonly ReviewedSchemaBaselineV1[],
): Promise<void> {
    if (histories.length > expected.length) {
        throw new TypeError("Official bootstrap baseline store contains state outside the exact plan");
    }
    const expectedByKey = new Map(expected.map((baseline) => [baselineIdentity(baseline), baseline]));
    for (const history of histories) {
        const baseline = expectedByKey.get(baselineIdentity(history.current));
        if (!baseline || history.revisions.length !== 1) {
            throw new TypeError("Official bootstrap baseline store diverges from the exact plan");
        }
        const [storedIdentity, expectedIdentity] = await Promise.all([
            identifyReviewedSchemaBaseline(history.current),
            identifyReviewedSchemaBaseline(baseline),
        ]);
        if (storedIdentity.digest !== expectedIdentity.digest) {
            throw new TypeError("Official bootstrap baseline store contains divergent reviewed evidence");
        }
    }
}

function baselineIdentity(baseline: ReviewedSchemaBaselineV1): string {
    return [baseline.kind, baseline.version, baseline.packageDigest, baseline.connectorKey, baseline.lineageId].join(
        "\0",
    );
}

function packageIdentity(kind: string, version: string, digest: string): string {
    return `${kind}\0${version}\0${digest}`;
}
