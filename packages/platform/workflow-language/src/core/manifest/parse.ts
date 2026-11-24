import { z } from "zod";
import { canonicalizeIJson, parseStrictJson, isResourceId, resourcePublisher } from "@bernouy/ulvia-contracts/protocol";
import { isCanonicalSemVer, parseVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import type { WorkflowManifest } from "../../interfaces/manifest";
import { parseWorkflow } from "../parse";
import { workflowIssue } from "../errors";
const identifier = z
    .string()
    .max(128)
    .regex(/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u);
const resource = z.string().max(225).refine(isResourceId);
const descriptor = z.strictObject({
    kind: z.literal("workflow"),
    format: z.literal("ulvia-workflow-manifest/v1"),
    workflowId: resource,
    publisherId: z.string().max(96),
    name: z.string().min(1).max(128),
    description: z.string().max(4096).optional(),
    documentation: z.string().max(65536).optional(),
    version: z.string().max(128).refine(isCanonicalSemVer),
    requirements: z
        .array(
            z.strictObject({
                contractId: resource,
                versionRange: z.string().min(1).max(512),
                capabilityIds: z.array(identifier).max(128).readonly(),
                eventIds: z.array(identifier).max(128).readonly(),
            }),
        )
        .max(64)
        .readonly(),
    definition: z.unknown(),
});
export function parseWorkflowManifest(input: string): WorkflowManifest {
    let value: z.output<typeof descriptor>;
    try {
        value = descriptor.parse(parseStrictJson(new TextEncoder().encode(input), 1048576, 64));
    } catch {
        return workflowIssue("manifest");
    }
    if (resourcePublisher(value.workflowId) !== value.publisherId) {
        workflowIssue("manifest.publisherId");
    }
    const definition = parseWorkflow(canonicalizeIJson(value.definition));
    const byContract = new Map(value.requirements.map((requirement) => [requirement.contractId, requirement]));
    if (byContract.size !== value.requirements.length) {
        workflowIssue("manifest.requirements.duplicate");
    }
    for (const requirement of value.requirements) {
        try {
            parseVersionRange(requirement.versionRange, "manifest.requirements.versionRange");
        } catch {
            workflowIssue("manifest.requirements.versionRange");
        }
        if (
            (!requirement.capabilityIds.length && !requirement.eventIds.length) ||
            new Set(requirement.capabilityIds).size !== requirement.capabilityIds.length ||
            new Set(requirement.eventIds).size !== requirement.eventIds.length
        ) {
            workflowIssue("manifest.requirements.members");
        }
    }
    for (const step of definition.steps) {
        if (
            step.kind === "call" &&
            !byContract.get(step.target.contractId)?.capabilityIds.includes(step.target.capabilityId)
        ) {
            workflowIssue(`manifest.requirements.${step.target.contractId}.${step.target.capabilityId}`);
        }
    }
    if (
        definition.trigger &&
        !byContract.get(definition.trigger.contractId)?.eventIds.includes(definition.trigger.eventType)
    ) {
        workflowIssue("manifest.requirements.trigger");
    }
    for (const requirement of value.requirements) {
        const calls = new Set(
            definition.steps
                .filter((step) => step.kind === "call" && step.target.contractId === requirement.contractId)
                .map((step) => (step.kind === "call" ? step.target.capabilityId : "")),
        );
        const events = definition.trigger?.contractId === requirement.contractId ? [definition.trigger.eventType] : [];
        if (
            requirement.capabilityIds.some((id) => !calls.has(id)) ||
            requirement.eventIds.some((id) => !events.includes(id))
        ) {
            workflowIssue("manifest.requirements.unused");
        }
    }
    const requirements = value.requirements
        .map((requirement) => ({
            ...requirement,
            capabilityIds: [...requirement.capabilityIds].sort(),
            eventIds: [...requirement.eventIds].sort(),
        }))
        .sort((a, b) => (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0));
    return { ...value, definition, requirements };
}
