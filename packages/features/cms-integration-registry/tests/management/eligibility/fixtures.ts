import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FsIntegrationRegistryVersionEligibilityManager } from "../../../src/default-implementation/fs/registry/promotion/eligibility";
import { readVersionEligibilityRecord } from "../../../src/default-implementation/fs/registry/promotion/eligibility/document";
import type { ReleaseAdmissionDecisionStore } from "../../../src/interfaces/reportStore";
import { publicationPackage, registryFixture } from "../../publication/fixtures";

const CREATED_AT = "2026-07-26T12:00:00.000Z";

export {
    appendAdverseDecisionRevision,
    appendAdverseVerificationRevision,
    appendDecision,
    restartedDecisions,
} from "./decisionFixtures";

export async function publishVersions(fixture: ReturnType<typeof registryFixture>, versions: readonly string[]) {
    for (const version of versions) {
        await fixture.publisher.publish({ package: await publicationPackage("demo", version) });
    }
}

export function eligibilityManager(
    fixture: ReturnType<typeof registryFixture>,
    decisions: ReleaseAdmissionDecisionStore,
    overrides: Partial<ConstructorParameters<typeof FsIntegrationRegistryVersionEligibilityManager>[0]> = {},
) {
    return new FsIntegrationRegistryVersionEligibilityManager({
        root: fixture.root,
        snapshots: fixture.snapshots,
        decisions,
        mutations: fixture.mutations,
        createOperationId: () => "eligibility-operation-1",
        createRecordId: () => "eligibility-record-1",
        now: () => CREATED_AT,
        ...overrides,
    });
}

export function blockRequest(version: string, decision: Readonly<{ revisionId: string; digest: string }>) {
    return {
        kind: "demo",
        version,
        currentDecision: decision,
        actor: "admin:user-1",
        reason: "Emergency security block",
        confirmation: {
            action: "block" as const,
            kind: "demo",
            version,
            decisionRevisionId: decision.revisionId,
            decisionDigest: decision.digest,
        },
    };
}

export function eligibilityRecords(root: string): string {
    return join(root, "demo", ".registry", "eligibility", "records");
}

export function eligibilityJournals(root: string): string {
    return join(root, "demo", ".registry", "eligibility", "journals");
}

export async function persistedEligibilityRecord(root: string) {
    const records = eligibilityRecords(root);
    const [filename] = readdirSync(records);
    return await readVersionEligibilityRecord(join(records, filename!));
}
