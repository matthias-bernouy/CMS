import { afterEach, describe, expect, test } from "bun:test";
import {
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationStaleReportError,
    IntegrationCompatibilityReevaluationValidationError,
} from "@bernouy/cms-integration-registry";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../publication/fixtures";
import { publishVersionPair, reevaluationRequest, reevaluationServices } from "./reevaluationFixtures";

afterEach(cleanupRegistryFixtures);

describe("compatibility reevaluation", () => {
    test("rebuilds the exact admission comparison and appends provenance", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const { reevaluator, reports } = reevaluationServices(fixture);

        const result = await reevaluator.reevaluate(reevaluationRequest(candidate.report.id));

        expect(result.revision).toMatchObject({
            reportType: "revision",
            supersedes: candidate.report.id,
            kind: "demo",
            version: "1.1.0",
            packageDigest: candidate.digest,
            baselines: candidate.report.baselines,
            informationalBaselines: [],
            provenance: {
                actor: "admin:user-1",
                reason: "Run the current compatibility evaluator",
                evidenceIds: ["schema-ci-1", "schema-ci-2"],
            },
        });
        expect(result.history.current.id).toBe(result.revision.id);
        expect((await reports.get("demo", "1.1.0"))?.reports.map(({ id }) => id)).toEqual([
            candidate.report.id,
            result.revision.id,
        ]);
    });

    test("preserves the explicit no-baseline semantics for a first version", async () => {
        const fixture = registryFixture();
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const { reevaluator } = reevaluationServices(fixture);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(published.report.id),
            version: "1.0.0",
            evidenceIds: undefined,
        });

        expect(result.revision).toMatchObject({
            supersedes: published.report.id,
            baselines: [],
            informationalBaselines: [],
            noBaselineReason: "new-kind",
            outcome: "not-applicable",
            releaseLevel: "initial",
        });
        expect(result.revision.provenance.evidenceIds).toBeUndefined();
    });

    test("rejects absent histories and a request that no longer names the current report", async () => {
        const fixture = registryFixture();
        const { reevaluator } = reevaluationServices(fixture);

        await expect(reevaluator.reevaluate(reevaluationRequest("missing-report"))).rejects.toBeInstanceOf(
            IntegrationCompatibilityReevaluationNotFoundError,
        );

        const { candidate } = await publishVersionPair(fixture);
        const first = await reevaluator.reevaluate(reevaluationRequest(candidate.report.id));
        const stale = reevaluator.reevaluate(reevaluationRequest(candidate.report.id));

        await expect(stale).rejects.toMatchObject({
            status: 409,
            requestedReportRevisionId: candidate.report.id,
            currentReportRevisionId: first.revision.id,
        });
        await expect(stale).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationStaleReportError);
    });

    test("validates a closed request shape before reading registry state", async () => {
        const fixture = registryFixture();
        const { reevaluator } = reevaluationServices(fixture);
        const invalid = { ...reevaluationRequest("report-1"), unexpected: true };

        const promise = reevaluator.reevaluate(invalid);

        await expect(promise).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationValidationError);
        await expect(promise).rejects.toMatchObject({ status: 422 });
    });
});
