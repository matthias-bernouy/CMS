import type { CmsRepository } from "@bernouy/cms-content";
import type { CollectionIntegrationDefinition, IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationInstallationRepository } from "../../interfaces/IntegrationInstallationRepository";
import { IntegrationInputError, IntegrationRuntimeError, MissingIntegrationInstallationError } from "../errors";
import { claimPendingIntegrationOperation, replaceCurrentInstallation } from "../installation/execution/ordinary/claim";
import { assertCollectionConformance } from "./conformance";
import { resolveCollectionSelection } from "./selection";
import { requestedAvailability, availabilityWrites } from "./availabilityPlan";

/** Updates insertion availability without rebuilding artifacts or changing their runtime/editor bundles. */
export async function updateCollectionAvailability(
    installations: IntegrationInstallationRepository,
    repository: Pick<CmsRepository, "getBlocRecord" | "setBlocCatalogue">,
    id: string,
    body: Record<string, unknown>,
    context: {
        definition?: IntegrationDefinition;
        installedDefinitions?: readonly IntegrationDefinition[];
    } = {},
) {
    const installation = await installations.get(id);
    if (!installation) {
        throw new MissingIntegrationInstallationError(id);
    }
    const definition = installation.definitionSnapshot ?? context.definition;
    if (definition?.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        throw new IntegrationInputError("id", "availability requires a managed collection");
    }
    if (!installation.definitionSnapshot) {
        assertInstalledDefinition(definition, installation.id, installation.definitionVersion);
    }
    const migration = installation.migrationOperation;
    if (
        installation.status !== "success" ||
        installation.pendingOperation ||
        (migration && !["completed", "aborted"].includes(migration.status))
    ) {
        throw new IntegrationRuntimeError("Collection installation must be active and idle", 409);
    }
    if (!installations.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("Atomic installation updates are unavailable", 503);
    }
    const { previous, requested } = requestedAvailability(definition, installation, body);
    const definitions = installedDefinitions(
        await installations.list(),
        context.installedDefinitions ?? [],
        definition,
    );
    const { activeResources } = resolveCollectionSelection(definition, requested, previous, definitions);
    assertCollectionConformance(definition, definitions, activeResources);
    const writes = await availabilityWrites(repository, definition, previous, activeResources);
    const result = { id, activeResources, changed: writes.map((write) => write.tag) };
    if (!writes.length && [...previous].sort().join("\n") === activeResources.join("\n")) {
        return result;
    }
    const pending = await claimPendingIntegrationOperation(installations, installation);
    const applied: typeof writes = [];
    try {
        for (const write of writes) {
            await repository.setBlocCatalogue(write.tag, write.ownership, write.after);
            applied.push(write);
        }
        await replaceCurrentInstallation(installations, pending, { ...installation, activeResources });
        return result;
    } catch (error) {
        // Keep the operation pending if compensation fails; an installation repair can reconcile its artifacts.
        for (const write of applied.reverse()) {
            await repository.setBlocCatalogue(write.tag, write.ownership, write.before);
        }
        await replaceCurrentInstallation(installations, pending, installation);
        throw error;
    }
}

function assertInstalledDefinition(definition: CollectionIntegrationDefinition, id: string, version: string): void {
    if (definition.kind !== id || definition.version !== version) {
        throw new IntegrationInputError("id", "availability definition does not match the installed collection");
    }
}

function installedDefinitions(
    installations: Awaited<ReturnType<IntegrationInstallationRepository["list"]>>,
    resolved: readonly IntegrationDefinition[],
    current: CollectionIntegrationDefinition,
): IntegrationDefinition[] {
    const definitions = new Map<string, IntegrationDefinition>();
    for (const installation of installations) {
        if (installation.status === "success" && installation.definitionSnapshot) {
            definitions.set(installation.id, installation.definitionSnapshot);
        }
    }
    for (const definition of resolved) {
        definitions.set(definition.kind, definition);
    }
    definitions.set(current.kind, current);
    return [...definitions.values()];
}
