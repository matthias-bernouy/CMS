import type { CmsRepository, BlocOwnership } from "@bernouy/cms-content";
import type { CollectionIntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import { IntegrationInputError, IntegrationRuntimeError } from "../errors";
import { parseIntegrationImportDto } from "../parsing/parseIntegrationImportDto";
import { collectionSelectableResources } from "./selection";

export function requestedAvailability(
    definition: CollectionIntegrationDefinition,
    installation: IntegrationInstallation,
    body: Record<string, unknown>,
) {
    const previous =
        installation.activeResources ??
        collectionSelectableResources(definition)
            .filter((r) => r.defaultActive)
            .map((r) => r.id);
    if (body.resource !== undefined) {
        if (
            body.resources !== undefined ||
            typeof body.resource !== "string" ||
            !collectionSelectableResources(definition).some((r) => r.id === body.resource)
        ) {
            throw new IntegrationInputError("resource", "a known selectable resource is required");
        }
        if (![true, false, "true", "false"].includes(body.active as boolean | string)) {
            throw new IntegrationInputError("active", "a boolean is required");
        }
        const selected = new Set(previous);
        if (body.active === true || body.active === "true") {
            selected.add(body.resource);
        } else {
            selected.delete(body.resource);
        }
        return { previous, requested: [...selected] };
    }
    if (body.active !== undefined) {
        throw new IntegrationInputError("resource", "resource is required with active");
    }
    const { resources } = parseIntegrationImportDto(
        { kind: definition.kind, resources: body.resources === undefined ? [] : body.resources },
        [definition],
    );
    return { previous, requested: resources! };
}

export async function availabilityWrites(
    repository: Pick<CmsRepository, "getBlocRecord">,
    definition: CollectionIntegrationDefinition,
    previous: string[],
    selected: string[],
) {
    const before = new Set(previous);
    const after = new Set(selected);
    const writes: Array<{
        tag: string;
        ownership: BlocOwnership;
        before: "active" | "inactive";
        after: "active" | "inactive";
    }> = [];
    for (const resource of collectionSelectableResources(definition)) {
        if (before.has(resource.id) === after.has(resource.id)) {
            continue;
        }
        const record = await repository.getBlocRecord(resource.artifact);
        if (!record?.artifact && !after.has(resource.id)) {
            continue;
        }
        if (
            !record?.artifact ||
            record.ownership.kind !== "integration" ||
            record.ownership.installationId !== definition.kind ||
            record.ownership.definitionVersion !== definition.version
        ) {
            throw new IntegrationRuntimeError(
                `Installed bloc "${resource.artifact}" is unavailable or its owner changed`,
                409,
            );
        }
        writes.push({
            tag: record.tag,
            ownership: record.ownership,
            before: record.artifact.catalogue ?? "active",
            after: after.has(resource.id) ? "active" : "inactive",
        });
    }
    return writes;
}
