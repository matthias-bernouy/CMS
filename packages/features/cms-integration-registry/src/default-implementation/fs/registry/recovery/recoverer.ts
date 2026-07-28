import { lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type {
    IntegrationRegistryRecoverer,
    IntegrationRegistryRecoveryDiagnostic,
    IntegrationRegistryRecoveryResult,
} from "../../../../interfaces/recovery";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../core/catalog/reference";
import type { ReleaseAdmissionDecisionStore } from "../../../../interfaces/reportStore";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../snapshot/builder";
import { boundedDirectoryNames, publicationJournalInventory, stagingInventory } from "./inventory";
import { ensureFsIntegrationRegistryLayout, type FsIntegrationRegistryLayout } from "../persistence/layout";
import { quarantineRegistryPath } from "./quarantine";
import { quarantineFailedPublication, replayPublicationJournal } from "./replay/index";
import { recoverStablePromotions } from "../promotion/recovery/index";
import { recoverVersionEligibilityMutations } from "../promotion/eligibility/recovery";

export type FsIntegrationRegistryRecovererConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotReference;
    packageLimits?: Partial<IntegrationPackageLimits>;
    releaseDecisions?: ReleaseAdmissionDecisionStore;
}>;

export class FsIntegrationRegistryRecoverer implements IntegrationRegistryRecoverer {
    constructor(private readonly config: FsIntegrationRegistryRecovererConfig) {}

    async recover(): Promise<IntegrationRegistryRecoveryResult> {
        return await recoverFsIntegrationRegistry(this.config);
    }
}

export async function recoverFsIntegrationRegistry(
    config: FsIntegrationRegistryRecovererConfig,
): Promise<IntegrationRegistryRecoveryResult> {
    const layout = await ensureFsIntegrationRegistryLayout(config.root);
    const diagnostics: IntegrationRegistryRecoveryDiagnostic[] = [];
    for (const entry of await publicationJournalInventory(layout)) {
        try {
            if (!entry.valid) {
                throw new Error("Publication journal inventory entry is not a regular JSON file");
            }
            const replayed = await replayPublicationJournal({ entry, layout, config });
            diagnostics.push(replayed.diagnostic);
        } catch (error) {
            diagnostics.push(await quarantineFailedPublication(entry, layout, config.packageLimits, error));
        }
    }
    await quarantineAbandonedStaging(layout, diagnostics);
    let snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
        root: layout.root,
        packageLimits: config.packageLimits,
    });
    config.snapshots.swap(snapshot);
    diagnostics.push(
        ...(await recoverStablePromotions({
            layout,
            snapshots: config.snapshots,
            packageLimits: config.packageLimits,
            ...(config.releaseDecisions ? { releaseDecisions: config.releaseDecisions } : {}),
        })),
    );
    if (config.releaseDecisions) {
        diagnostics.push(
            ...(await recoverVersionEligibilityMutations({
                layout,
                snapshots: config.snapshots,
                packageLimits: config.packageLimits,
                decisions: config.releaseDecisions,
            })),
        );
    }
    snapshot = config.snapshots.current();
    await quarantineOrphanVersions(layout, snapshot, diagnostics);
    snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
        root: layout.root,
        packageLimits: config.packageLimits,
    });
    config.snapshots.swap(snapshot);
    return { snapshot, diagnostics };
}

async function quarantineAbandonedStaging(
    layout: FsIntegrationRegistryLayout,
    diagnostics: IntegrationRegistryRecoveryDiagnostic[],
): Promise<void> {
    for (const source of await stagingInventory(layout)) {
        const operationId = basename(source);
        const destination = await quarantineRegistryPath(layout, `abandoned-${operationId}`, "staging", source);
        if (destination) {
            diagnostics.push({
                code: "abandoned-staging-quarantined",
                source,
                message: `Moved abandoned publication staging to ${destination}`,
                operationId,
            });
        }
    }
}

async function quarantineOrphanVersions(
    layout: FsIntegrationRegistryLayout,
    snapshot: IntegrationRegistryRecoveryResult["snapshot"],
    diagnostics: IntegrationRegistryRecoveryDiagnostic[],
): Promise<void> {
    for (const summary of snapshot.summaries) {
        const locations = summary.versions.map((version) => snapshot.locateExactVersion(summary.kind, version)!);
        const first = locations[0];
        if (!first) {
            continue;
        }
        const versionsRoot = join(first.integrationRoot, "versions");
        if (!(await isDirectory(versionsRoot))) {
            continue;
        }
        const expected = new Set(locations.map((location) => basename(location.packageRoot)));
        for (const version of await boundedDirectoryNames(versionsRoot)) {
            if (expected.has(version)) {
                continue;
            }
            const source = join(versionsRoot, version);
            const namespace = `orphan-${summary.kind}-${version}`;
            const destination = await quarantineRegistryPath(layout, namespace, "version", source);
            if (!destination) {
                continue;
            }
            await quarantineRegistryPath(
                layout,
                namespace,
                "manifest",
                join(first.integrationRoot, ".registry", "manifests", `${version}.json`),
            );
            diagnostics.push({
                code: "orphan-version-quarantined",
                source,
                message: `Moved unreferenced integration version to ${destination}`,
                kind: summary.kind,
                version,
            });
        }
    }
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        const metadata = await lstat(path);
        return metadata.isDirectory() && !metadata.isSymbolicLink();
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
