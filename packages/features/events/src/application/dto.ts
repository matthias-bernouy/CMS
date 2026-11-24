import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { EventDefinitionSummary, EventDefinition } from "cms-events/interfaces/definition";
import type { EventSubscription } from "cms-events/interfaces/subscription";
export function definitionSummary(definition: EventDefinitionSummary) {
    return {
        definitionId: definition.id,
        contractId: definition.owner.namespace,
        installationId: definition.owner.installationId,
        eventType: definition.eventType,
        version: definition.version,
        digest: definition.digest,
        sensitive: definition.sensitive,
        ...(definition.filterKeys ? { filterKeys: definition.filterKeys } : {}),
        retired: definition.retired,
        createdAt: definition.createdAt,
    };
}
export function definitionDto(definition: EventDefinition) {
    return { ...definitionSummary(definition), schemaJson: canonicalizeIJson(definition.schema) };
}
export function subscriptionDto(record: EventSubscription) {
    return {
        subscriptionId: record.id,
        consumerContractId: record.owner.consumerContractId,
        revision: record.revision,
        configuration: {
            definitionId: record.definitionId,
            definitionDigest: record.definitionDigest,
            ...(record.filterJson === undefined ? {} : { filterJson: record.filterJson }),
            enabled: record.enabled,
            delivery: record.delivery,
        },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
