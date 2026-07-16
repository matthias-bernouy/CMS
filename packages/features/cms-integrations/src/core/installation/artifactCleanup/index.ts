import type {
    IntegrationArtifactResult,
    IntegrationArtifactType,
    IntegrationImportDeps,
} from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import {
    deleteArtifact,
    restoreArtifacts,
    type ArtifactRestorer,
} from "./repositoryArtifacts";

type ObsoleteArtifactCleanupRequest<T> = {
    deps: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    installationId: string;
    previousArtifacts: IntegrationArtifactResult[];
    nextArtifacts: IntegrationArtifactResult[];
    operation: () => Promise<T>;
};

const DELETE_ORDER: Record<IntegrationArtifactType, number> = {
    dashboardRelation: 0,
    relation: 1,
    sourceOverlay: 2,
    trigger: 3,
    dashboard: 4,
    function: 5,
    source: 6,
    bloc: 7,
};

/**
 * Removes artifacts that disappeared from a rerun definition while the import
 * rollback stack is still active. If cleanup or final installation persistence
 * fails, deleted artifacts are restored before the new writes are rolled back.
 */
export async function withObsoleteArtifactCleanup<T>(
    request: ObsoleteArtifactCleanupRequest<T>,
): Promise<T> {
    const obsolete = await findUnclaimedObsoleteArtifacts(request);
    const restorers: ArtifactRestorer[] = [];

    try {
        for (const artifact of obsolete) {
            const restore = await deleteArtifact(request.deps, artifact);
            if (restore) restorers.push(restore);
        }
        return await request.operation();
    } catch (error) {
        await restoreArtifacts(restorers);
        throw error;
    }
}

async function findUnclaimedObsoleteArtifacts(
    request: Omit<ObsoleteArtifactCleanupRequest<unknown>, "operation">,
): Promise<IntegrationArtifactResult[]> {
    const retained = new Set(request.nextArtifacts.map(artifactKey));
    const claimedElsewhere = new Set<string>();
    for (const installation of await request.installations.list()) {
        if (installation.id === request.installationId) continue;
        for (const artifact of installation.artifacts) claimedElsewhere.add(artifactKey(artifact));
    }

    const seen = new Set<string>();
    return request.previousArtifacts
        .filter(artifact => {
            const key = artifactKey(artifact);
            if (seen.has(key) || retained.has(key) || claimedElsewhere.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => DELETE_ORDER[left.type] - DELETE_ORDER[right.type]);
}

function artifactKey(artifact: Pick<IntegrationArtifactResult, "type" | "id">): string {
    return `${artifact.type}\u0000${artifact.id}`;
}
