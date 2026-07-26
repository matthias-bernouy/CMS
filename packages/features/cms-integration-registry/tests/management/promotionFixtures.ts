import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { IntegrationCompatibilityPackage } from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReportStore,
    FsIntegrationRegistryStablePromoter,
    readStablePromotionRecord,
} from "@bernouy/cms-integration-registry/fs";
import { registryFixture } from "../publication/fixtures";

export function stablePromoter(
    fixture: ReturnType<typeof registryFixture>,
    reports: FsIntegrationCompatibilityReportStore,
): FsIntegrationRegistryStablePromoter {
    return new FsIntegrationRegistryStablePromoter({
        root: fixture.root,
        snapshots: fixture.snapshots,
        reports,
        mutations: fixture.mutations,
        createOperationId: () => "promotion-operation-1",
        createPromotionId: () => "promotion-1",
        now: () => "2026-07-26T12:00:00.000Z",
    });
}

export function reportStore(fixture: ReturnType<typeof registryFixture>): FsIntegrationCompatibilityReportStore {
    return new FsIntegrationCompatibilityReportStore({ snapshots: fixture.snapshots, mutations: fixture.mutations });
}

export function compatibilityPackage(
    fixture: ReturnType<typeof registryFixture>,
    version: string,
): IntegrationCompatibilityPackage {
    const location = fixture.snapshots.current().locateExactVersion("demo", version)!;
    return { definition: location.definitionSnapshot, packageDigest: location.package.digest };
}

export function compatibleRevision(fixture: ReturnType<typeof registryFixture>, supersedes: string) {
    return fixture.compatibility.evaluateRevision(
        { baseline: compatibilityPackage(fixture, "1.0.0"), candidate: compatibilityPackage(fixture, "1.1.0") },
        supersedes,
        { actor: "admin:user-1", reason: "Re-evaluated with the current comparator" },
    );
}

export function adverseRevision(fixture: ReturnType<typeof registryFixture>, supersedes: string) {
    const candidate = compatibilityPackage(fixture, "1.1.0");
    return fixture.compatibility.evaluateRevision(
        {
            baseline: compatibilityPackage(fixture, "1.0.0"),
            candidate: {
                ...candidate,
                schemaDeclarationEvidence: [
                    {
                        evidenceId: `contradiction-${supersedes}`,
                        packageDigest: candidate.packageDigest,
                        connector: { provider: "supabase" },
                        producer: { name: "schema-verifier", version: "2.0.0" },
                        createdAt: "2026-07-26T11:00:00.000Z",
                        verdict: "contradiction",
                    },
                ],
            },
        },
        supersedes,
        { actor: "admin:user-2", reason: "Trusted evidence found a contradiction" },
    );
}

export function promotionRecords(root: string): string {
    return join(promotionRoot(root), "records");
}

export function promotionJournals(root: string): string {
    return join(promotionRoot(root), "journals");
}

export async function persistedRecord(root: string) {
    const records = promotionRecords(root);
    const [filename] = readdirSync(records);
    return await readStablePromotionRecord(join(records, filename!));
}

function promotionRoot(root: string): string {
    return join(root, "demo", ".registry", "promotions");
}
