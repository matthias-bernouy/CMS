import { IntegrationRuntimeError } from "../errors";
import type {
    IntegrationArtifactResult,
    IntegrationArtifactType,
    IntegrationImportDeps,
} from "../../interfaces/IntegrationImport";
import type { IntegrationInstallationRepository } from "../../interfaces/IntegrationInstallationRepository";

type ArtifactRestorer = () => Promise<void>;

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

async function deleteArtifact(
    deps: IntegrationImportDeps,
    artifact: IntegrationArtifactResult,
): Promise<ArtifactRestorer | null> {
    switch (artifact.type) {
        case "source": {
            const previous = await deps.sources.getSource(artifact.id);
            if (!previous || !await deps.sources.deleteSource(artifact.id)) return null;
            return () => restoreIfMissing(
                () => deps.sources.getSource(artifact.id),
                () => deps.sources.createSource(previous),
            );
        }
        case "function": {
            const repository = deps.functions ?? missingRepository("function");
            const previous = await repository.getFunction(artifact.id);
            if (!previous || !await repository.deleteFunction(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getFunction(artifact.id),
                () => repository.createFunction(previous),
            );
        }
        case "trigger": {
            const repository = deps.triggers ?? missingRepository("trigger");
            const previous = await repository.getTrigger(artifact.id);
            if (!previous || !await repository.deleteTrigger(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getTrigger(artifact.id),
                () => repository.createTrigger(previous),
            );
        }
        case "dashboard": {
            const repository = deps.dashboards ?? missingRepository("dashboard");
            const previous = await repository.getDashboard(artifact.id);
            if (!previous || !await repository.deleteDashboard(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getDashboard(artifact.id),
                () => repository.createDashboard(previous),
            );
        }
        case "sourceOverlay": {
            const repository = deps.sourceOverlays ?? missingRepository("source overlay");
            const previous = await repository.getOverlay(artifact.id);
            if (!previous || !await repository.deleteOverlay(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getOverlay(artifact.id),
                () => repository.upsertOverlay(previous),
            );
        }
        case "relation": {
            const repository = deps.relations ?? missingRepository("relation");
            const previous = await repository.getRelation(artifact.id);
            if (!previous || !await repository.deleteRelation(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getRelation(artifact.id),
                () => repository.createRelation(previous),
            );
        }
        case "dashboardRelation": {
            const repository = deps.relations ?? missingRepository("relation");
            const previous = await repository.getDashboardRelationProjection(artifact.id);
            if (!previous || !await repository.deleteDashboardRelationProjection(artifact.id)) return null;
            return () => restoreIfMissing(
                () => repository.getDashboardRelationProjection(artifact.id),
                () => repository.createDashboardRelationProjection(previous),
            );
        }
        case "bloc":
            throw new IntegrationRuntimeError(
                `cannot remove obsolete bloc artifact "${artifact.id}": bloc deletion is not supported`,
            );
    }
}

async function restoreIfMissing<T>(
    get: () => Promise<T | null>,
    create: () => Promise<unknown>,
): Promise<void> {
    if (await get()) return;
    await create();
}

async function restoreArtifacts(restorers: ArtifactRestorer[]): Promise<void> {
    for (const restore of restorers.reverse()) {
        try {
            await restore();
        } catch {
            // Best-effort rollback: keep restoring remaining artifacts.
        }
    }
}

function missingRepository(kind: string): never {
    throw new IntegrationRuntimeError(`${kind} repository not configured`);
}

function artifactKey(artifact: Pick<IntegrationArtifactResult, "type" | "id">): string {
    return `${artifact.type}\u0000${artifact.id}`;
}
