import type { ContractEventDefinition } from "ulvia-contracts/interfaces/ContractEvent";
import type { ContractRelease } from "ulvia-contracts/interfaces/ContractRelease";
import type { CompatibilityIssue } from "ulvia-contracts/core/compatibility/compareContractReleases";
import type { UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import { canonicalizeIJson } from "ulvia-contracts/core/protocol/canonical";
import { compareSchema } from "ulvia-contracts/core/compatibility/capability/schema";

export function compareEvent(
    before: ContractEventDefinition,
    after: ContractEventDefinition,
    maxDepth: number,
): readonly CompatibilityIssue[] {
    const path = `events[${JSON.stringify(before.id)}]`;
    const issues: CompatibilityIssue[] = [];
    if (canonicalizeIJson(before.filterKeys ?? null) !== canonicalizeIJson(after.filterKeys ?? null)) {
        issues.push({
            code: "event_changed",
            eventId: before.id,
            path,
            message: "event filter keys changed",
            requiredBump: "major",
        });
    }
    if (
        before.sensitive !== after.sensitive ||
        canonicalizeIJson(sensitivity(before.schema) ?? null) !== canonicalizeIJson(sensitivity(after.schema) ?? null)
    ) {
        issues.push({
            code: "event_changed",
            eventId: before.id,
            path,
            message: "event sensitivity changed",
            requiredBump: "major",
        });
    }
    const schema = compareSchema(before.schema, after.schema, `${path}.schema`, "output", maxDepth);
    if (schema) {
        issues.push({ ...schema, eventId: before.id });
    }
    return issues;
}

export function compareEvents(
    before: ContractRelease,
    after: ContractRelease,
    maxDepth: number,
): readonly CompatibilityIssue[] {
    const previous = new Map((before.events ?? []).map((event) => [event.id, event]));
    const next = new Map((after.events ?? []).map((event) => [event.id, event]));
    const issues: CompatibilityIssue[] = [];
    for (const [id, event] of previous) {
        const replacement = next.get(id);
        if (!replacement) {
            issues.push({
                code: "event_removed",
                eventId: id,
                path: `events[${JSON.stringify(id)}]`,
                message: `removed event ${id}`,
                requiredBump: "major",
            });
        } else {
            issues.push(...compareEvent(event, replacement, maxDepth));
        }
    }
    for (const id of next.keys()) {
        if (!previous.has(id)) {
            issues.push({
                code: "event_added",
                eventId: id,
                path: `events[${JSON.stringify(id)}]`,
                message: `added event ${id}`,
                requiredBump: "minor",
            });
        }
    }
    return issues;
}

function sensitivity(schema: UlviaSchema): unknown {
    switch (schema.type) {
        case "string":
            return schema.sensitive === true ? true : undefined;
        case "object": {
            const properties = Object.entries(schema.properties)
                .map(([name, value]) => [name, sensitivity(value)] as const)
                .filter(([, value]) => value !== undefined);
            return properties.length ? Object.fromEntries(properties) : undefined;
        }
        case "array":
            return sensitivity(schema.items);
        case "map":
            return sensitivity(schema.values);
        default:
            return undefined;
    }
}
