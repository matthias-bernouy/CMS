import { parseUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import type { TriggerEventPhase, TriggerRecord } from "../interfaces/TriggerDefinition";

export type TriggerEndpointMatch = {
    source: string;
    endpoint: string;
};

export function endpointMatch(endpoint: SourceEndpoint): TriggerEndpointMatch | null {
    const parsed = parseUrn(endpoint.urn);
    if (!parsed?.endpoint) return null;
    return { source: parsed.source, endpoint: parsed.endpoint };
}

export function matchesTriggerEndpoint(trigger: TriggerRecord, endpoint: SourceEndpoint, phase: TriggerEventPhase): boolean {
    if (!trigger.enabled) return false;
    if (trigger.event.kind !== "endpoint") return false;
    if (trigger.event.phase !== phase) return false;
    const match = endpointMatch(endpoint);
    if (!match) return false;
    if (trigger.event.source !== undefined && trigger.event.source !== match.source) return false;
    if (trigger.event.endpoint !== undefined && trigger.event.endpoint !== match.endpoint) return false;
    return true;
}

export function matchingTriggers(
    triggers: readonly TriggerRecord[],
    endpoint: SourceEndpoint,
    phase: TriggerEventPhase,
): TriggerRecord[] {
    return triggers.filter(trigger => matchesTriggerEndpoint(trigger, endpoint, phase));
}
