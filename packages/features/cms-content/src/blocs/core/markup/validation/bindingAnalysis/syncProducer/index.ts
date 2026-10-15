import { ContentValidationError } from "cms-content/application/core/validation/errors";
import {
    CMS_BINDING_ATTRIBUTES,
    parseMutation,
    parseQuery,
    parseSyncSelection,
} from "cms-content/blocs/core/markup/bindings";
import type { BindingCapability, BindingValueSchema } from "../types";
import { projectSchema } from "./projection";
import { fallbackVariant, operationSnapshots } from "./snapshots";

export function resolveSyncProducerSchemas(
    element: Element,
    capabilities: readonly BindingCapability[],
    requireResolution = false,
): readonly BindingValueSchema[] {
    if (!element.hasAttribute(CMS_BINDING_ATTRIBUTES.sync)) {
        return [];
    }
    const query = parseQuery(element.getAttribute(CMS_BINDING_ATTRIBUTES.query) ?? "");
    const mutation = parseMutation(element.getAttribute(CMS_BINDING_ATTRIBUTES.mutation) ?? "");
    const binding = query ?? mutation;
    if (!binding || "sync" in binding) {
        return [];
    }
    const capability = capabilities.find(
        (candidate) => candidate.contractId === binding.contractId && candidate.capabilityId === binding.capabilityId,
    );
    if (!capability) {
        if (requireResolution) {
            throw issue(`CMS synchronized producer ${binding.contractId}:${binding.capabilityId} cannot be resolved`);
        }
        return [];
    }
    const rawSelection = element.getAttribute(CMS_BINDING_ATTRIBUTES.syncSelect);
    const selection = rawSelection === null ? null : parseSyncSelection(rawSelection);
    if (rawSelection !== null && !selection) {
        throw issue("CMS synchronized producer selection is invalid");
    }
    const variants = capability.variants ?? [fallbackVariant(capability)];
    const snapshots = variants.flatMap((variant) => operationSnapshots(mutation ? "mutation" : "query", variant));
    return uniqueSchemas(snapshots.map((schema) => (selection ? projectSchema(schema, selection) : schema)));
}

function uniqueSchemas(schemas: readonly BindingValueSchema[]): BindingValueSchema[] {
    const unique = new Map(schemas.map((schema) => [JSON.stringify(schema), schema]));
    return [...unique.values()];
}

function issue(message: string): ContentValidationError {
    return new ContentValidationError("content", message);
}
