import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationCompatibilityReportStore,
} from "@bernouy/cms-integration-registry/fs";
import { publicationPackage, registryFixture } from "../publication/fixtures";

export function reevaluationServices(fixture: ReturnType<typeof registryFixture>) {
    const reports = new FsIntegrationCompatibilityReportStore({
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
    });
    const reevaluator = new FsIntegrationCompatibilityReevaluator({
        snapshots: fixture.snapshots,
        reports,
        evaluator: fixture.compatibility,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
    });
    return { reports, reevaluator };
}

export async function publishVersionPair(fixture: ReturnType<typeof registryFixture>) {
    const baseline = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
    const candidate = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
    return { baseline, candidate };
}

export function reevaluationRequest(currentReportRevisionId: string) {
    return {
        kind: "demo",
        version: "1.1.0",
        currentReportRevisionId,
        actor: "admin:user-1",
        reason: "Run the current compatibility evaluator",
        evidenceIds: ["schema-ci-2", "schema-ci-1"],
    };
}

export function rewriteAdmission(
    root: string,
    version: string,
    transform: (report: Record<string, unknown>) => void,
): void {
    const path = join(root, "demo", ".registry", "reports", version, "admission.json");
    const document = JSON.parse(readFileSync(path, "utf8")) as { report: Record<string, unknown> };
    transform(document.report);
    chmodSync(path, 0o640);
    writeFileSync(path, canonicalJsonBytes(document));
    chmodSync(path, 0o440);
}
