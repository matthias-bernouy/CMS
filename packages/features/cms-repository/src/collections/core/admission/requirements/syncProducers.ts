import { parseSyncTarget } from "@bernouy/cms-content/bindings";
import { resolveSyncProducerSchemas } from "@bernouy/cms-content/page-document";
import type { BindingQueryCapability, BindingValueSchema } from "@bernouy/cms-content/page-document";
import { firstSchemaSubsetViolation } from "cms-repository/exports/contracts/compatibility";
import type { UlviaSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import { CollectionValidationError } from "../../errors";

export function validateSynchronizedProducerSchemas(
    release: CollectionRelease,
    document: Document,
    capabilities: readonly BindingQueryCapability[],
    path: string,
): void {
    const states = new Map((release.states ?? []).map((state) => [`${release.collectionId}-${state.id}`, state]));
    for (const element of Array.from(document.querySelectorAll("[cms-sync]"))) {
        if (!element.hasAttribute("cms-query") && element.localName !== "form") {
            continue;
        }
        const target = parseSyncTarget(element.getAttribute("cms-sync"));
        const state = target ? states.get(target.key) : undefined;
        if (!target || !state) {
            continue;
        }
        for (const source of resolveSyncProducerSchemas(element, capabilities, true)) {
            const violation = firstSchemaSubsetViolation(asUlviaSchema(source), state.schema, "$.schema");
            if (violation) {
                throw new CollectionValidationError(
                    "invalid_collection",
                    `cms-sync producer is incompatible with state ${target.key} at ${violation}`,
                    path,
                );
            }
        }
    }
}

function asUlviaSchema(schema: BindingValueSchema): UlviaSchema {
    return schema as UlviaSchema;
}
