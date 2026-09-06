import { IntegrationInputError, IntegrationRuntimeError } from "../errors";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import { resolveCollectionSelection } from "./selection";

export type SourceRemovalBlocker = {
    collection: string;
    resources: string[];
};

export function sourceRemovalBlockers(
    source: string,
    installations: readonly IntegrationInstallation[],
): SourceRemovalBlocker[] {
    const definitions = installations.flatMap((installation): IntegrationDefinition[] =>
        installation.status === "success" && installation.definitionSnapshot ? [installation.definitionSnapshot] : [],
    );
    const definitionsByKind = new Map(definitions.map((definition) => [definition.kind, definition]));
    return installations.flatMap((installation) => {
        const definition = installation.definitionSnapshot;
        if (
            installation.status !== "success" ||
            definition?.schema !== "cms.integration.definition.v2" ||
            definition.type !== "collection"
        ) {
            return [];
        }
        const selection = resolveCollectionSelection(
            definition,
            installation.activeResources ?? [],
            undefined,
            definitions,
        );
        const resources = selection.effectiveResources
            .flatMap(({ kind, resources: ids }) => {
                const owner = definitionsByKind.get(kind);
                return owner?.schema === "cms.integration.definition.v2" && owner.type === "collection"
                    ? owner.resources.filter(
                          (resource) =>
                              ids.includes(resource.id) &&
                              resource.endpoints?.some((endpoint) => endpoint.source === source),
                      )
                    : [];
            })
            .map(({ id }) => id)
            .sort();
        return resources.length ? [{ collection: installation.id, resources }] : [];
    });
}

export function assertSourceCanBeRemoved(source: string, installations: readonly IntegrationInstallation[]): void {
    if (
        installations.some(
            (installation) =>
                installation.managementLease &&
                installation.managementLease.expiresAt.getTime() > Date.now() &&
                installation.artifacts.some(
                    (artifact) =>
                        artifact.type === "source" && (artifact.id === source || artifact.id === `urn:${source}`),
                ),
        )
    ) {
        throw new IntegrationRuntimeError("Integration management operation is in progress", 409);
    }
    const blockers = sourceRemovalBlockers(source, installations);
    if (!blockers.length) {
        return;
    }
    const uses = blockers.map(({ collection, resources }) => `${collection}: ${resources.join(", ")}`).join("; ");
    throw new IntegrationInputError(
        "source",
        `cannot remove source "${source}" while active collection resources depend on it (${uses})`,
    );
}
