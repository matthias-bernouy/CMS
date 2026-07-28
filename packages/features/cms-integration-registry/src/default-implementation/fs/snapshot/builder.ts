import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { createIntegrationRegistryCatalogSnapshot } from "../../../core/catalog/snapshot";
import type {
    IntegrationRegistryCatalogDiagnostic,
    IntegrationRegistryCatalogSnapshot,
    IntegrationRegistryQuarantinedEntry,
    IntegrationRegistryValidatedCatalogEntry,
} from "../../../interfaces/catalog";
import { CandidateValidationError, validateIntegrationCandidate } from "./candidate";
import { discoverIntegrationPackages, type FsIntegrationRegistryCatalogLimits } from "./discovery";

export type BuildFsIntegrationRegistryCatalogSnapshotConfig = Readonly<{
    root: string;
    catalogLimits?: Partial<FsIntegrationRegistryCatalogLimits>;
    packageLimits?: Partial<IntegrationPackageLimits>;
}>;

export async function buildFsIntegrationRegistryCatalogSnapshot(
    config: BuildFsIntegrationRegistryCatalogSnapshotConfig,
): Promise<IntegrationRegistryCatalogSnapshot> {
    const discovery = await discoverIntegrationPackages(config.root, config.catalogLimits);
    const entries: IntegrationRegistryValidatedCatalogEntry[] = [];
    const diagnostics = [...discovery.diagnostics];
    const quarantined = [...discovery.quarantined];

    for (const candidate of discovery.candidates) {
        try {
            entries.push(await validateIntegrationCandidate(candidate, config.packageLimits));
        } catch (error) {
            quarantineCandidate(candidate.root, error, diagnostics, quarantined);
        }
    }
    const duplicateKinds = duplicateKindSet(entries);
    const visibleEntries = entries.filter((entry) => !duplicateKinds.has(entry.index.kind));
    for (const kind of [...duplicateKinds].sort()) {
        for (const entry of entries.filter((candidate) => candidate.index.kind === kind)) {
            diagnostics.push({
                code: "duplicate-kind",
                stage: "identity",
                source: entry.source,
                message: `Duplicate integration kind "${kind}" is excluded from the catalog`,
                kind,
            });
            quarantined.push({ source: entry.source, kind, diagnosticCodes: ["duplicate-kind"] });
        }
    }
    return createIntegrationRegistryCatalogSnapshot({
        entries: visibleEntries,
        diagnostics,
        quarantined,
    });
}

function quarantineCandidate(
    source: string,
    error: unknown,
    diagnostics: IntegrationRegistryCatalogDiagnostic[],
    quarantined: IntegrationRegistryQuarantinedEntry[],
): void {
    const failure =
        error instanceof CandidateValidationError
            ? error
            : new CandidateValidationError(source, "index", "invalid-integration", undefined, undefined, error);
    diagnostics.push({
        code: failure.code,
        stage: failure.stage,
        source: failure.source,
        message: failure.message,
        ...(failure.kind ? { kind: failure.kind } : {}),
        ...(failure.version ? { version: failure.version } : {}),
    });
    quarantined.push({
        source,
        ...(failure.kind ? { kind: failure.kind } : {}),
        diagnosticCodes: [failure.code],
    });
}

function duplicateKindSet(entries: readonly IntegrationRegistryValidatedCatalogEntry[]): Set<string> {
    const counts = new Map<string, number>();
    for (const entry of entries) {
        counts.set(entry.index.kind, (counts.get(entry.index.kind) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([kind]) => kind));
}
