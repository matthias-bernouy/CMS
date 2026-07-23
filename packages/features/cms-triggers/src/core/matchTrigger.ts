import { parseUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import type { TriggerEventPhase, TriggerRecord } from "../interfaces/TriggerDefinition";

export type TriggerEndpointMatch = {
    source: string;
    endpoint: string;
};

export function endpointMatch(endpoint: SourceEndpoint): TriggerEndpointMatch | null {
    const parsed = parseUrn(endpoint.urn);
    if (!parsed?.endpoint) {
        return null;
    }
    return { source: parsed.source, endpoint: parsed.endpoint };
}

export function matchesTriggerEndpoint(
    trigger: TriggerRecord,
    endpoint: SourceEndpoint,
    phase: TriggerEventPhase,
): boolean {
    if (trigger.event.kind !== "endpoint" || trigger.event.phase !== phase) {
        return false;
    }
    const match = endpointMatch(endpoint);
    if (!match) {
        return false;
    }
    return matchesEndpointTriggerScope(trigger, match.source, match.endpoint);
}

export function matchesEndpointTriggerScope(trigger: TriggerRecord, source: string, endpoint: string): boolean {
    if (!trigger.enabled || trigger.event.kind !== "endpoint") {
        return false;
    }
    if (trigger.event.source !== undefined && trigger.event.source !== source) {
        return false;
    }
    return trigger.event.endpoint === undefined || trigger.event.endpoint === endpoint;
}

export function matchingTriggers(
    triggers: readonly TriggerRecord[],
    endpoint: SourceEndpoint,
    phase: TriggerEventPhase,
): TriggerRecord[] {
    return triggers.filter((trigger) => matchesTriggerEndpoint(trigger, endpoint, phase));
}
