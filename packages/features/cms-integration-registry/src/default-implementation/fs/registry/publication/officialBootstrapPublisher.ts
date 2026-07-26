import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { IntegrationCompatibilityAdmissionReport } from "../../../../interfaces/compatibility";
import type { IntegrationRegistryPublicationResult } from "../../../../interfaces/publication";
import { evaluatePublicationCompatibility } from "./compatibility";
import { nextIntegrationRegistryIndex } from "./index";
import { prepareFsOfficialBootstrapCandidate, type PreparedFsIntegrationRegistryCandidate } from "./candidate";
import { publishPreparedFsIntegrationRegistryCandidate } from "./publisher";
import type { FsIntegrationRegistryPublisherConfig } from "./types";

export type PreparedFsOfficialIntegrationRegistryBootstrap = Readonly<{
    packageCount: number;
}>;

const preparedCandidates = new WeakMap<
    PreparedFsOfficialIntegrationRegistryBootstrap,
    readonly Readonly<{
        candidate: PreparedFsIntegrationRegistryCandidate;
        report: IntegrationCompatibilityAdmissionReport;
    }>[]
>();

/**
 * Privileged one-time publisher for the reviewed legacy catalog bundled with
 * the repository image. It is deliberately separate from management writes.
 */
export class FsOfficialIntegrationRegistryBootstrapPublisher {
    constructor(private readonly config: FsIntegrationRegistryPublisherConfig) {}

    async prepare(
        packages: readonly ResolvedIntegrationPackage[],
    ): Promise<PreparedFsOfficialIntegrationRegistryBootstrap> {
        this.assertEmptyCatalog();
        if (packages.length === 0) {
            throw new TypeError("Official integration registry bootstrap requires at least one package");
        }
        const candidates: Array<{
            candidate: PreparedFsIntegrationRegistryCandidate;
            report: IntegrationCompatibilityAdmissionReport;
        }> = [];
        const kinds = new Set<string>();
        const emptySnapshot = this.config.snapshots.current();
        for (const integrationPackage of packages) {
            const candidate = await prepareFsOfficialBootstrapCandidate(integrationPackage, this.config.packageLimits);
            if (kinds.has(candidate.definition.kind)) {
                throw new TypeError("Official integration registry bootstrap accepts one initial version per kind");
            }
            kinds.add(candidate.definition.kind);
            nextIntegrationRegistryIndex(null, candidate.definition, candidate.package.envelope);
            const report = await evaluatePublicationCompatibility(emptySnapshot, candidate, this.config.compatibility);
            candidates.push({ candidate, report });
        }
        const preparation = Object.freeze({ packageCount: candidates.length });
        preparedCandidates.set(preparation, Object.freeze(candidates));
        return preparation;
    }

    async publishPrepared(
        preparation: PreparedFsOfficialIntegrationRegistryBootstrap,
    ): Promise<readonly IntegrationRegistryPublicationResult[]> {
        const candidates = preparedCandidates.get(preparation);
        if (!candidates) {
            throw new TypeError("Official integration registry bootstrap preparation is invalid");
        }
        this.assertEmptyCatalog();
        const results: IntegrationRegistryPublicationResult[] = [];
        for (const { candidate, report } of candidates) {
            results.push(
                await publishPreparedFsIntegrationRegistryCandidate(this.config, candidate, undefined, report),
            );
        }
        preparedCandidates.delete(preparation);
        return Object.freeze(results);
    }

    private assertEmptyCatalog(): void {
        const snapshot = this.config.snapshots.current();
        if (snapshot.summaries.length || snapshot.diagnostics.length || snapshot.quarantined.length) {
            throw new Error("Official integration registry bootstrap requires an empty healthy catalog snapshot");
        }
    }
}
