import { materializeWorkflowCapability } from "workflows/core/compiler/schemaResolution";
import { applySchemaBindings } from "@bernouy/ulvia-contracts/resolution";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { firstSchemaSubsetViolation, firstProjectedOutputViolation } from "@bernouy/ulvia-contracts/compatibility";
import type { WorkflowCapability, WorkflowContracts, WorkflowPlan } from "workflows/interfaces/definition";
import type { WorkflowDiagnostic } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
import { workflowResourceUse, resourceUseViolation } from "workflows/core/events/usage";

/** Current compatible releases may execute frozen JSON plans; ownership and effect semantics stay pinned. */
export async function resolveWorkflowCall(pinned: WorkflowCapability, contracts: WorkflowContracts, path: string) {
    const current = await materializeWorkflowCapability(
        await contracts.resolve(pinned.target.contractId, pinned.target.capabilityId),
        contracts,
        pinned.schemaInput,
        path,
    );
    const before = pinned.capability;
    const after = current.capability;
    if (
        ["installationId", "endpoint", "accountId", "instanceId"].some(
            (key) =>
                pinned.target[key as keyof typeof pinned.target] !== current.target[key as keyof typeof current.target],
        ) ||
        before.id !== after.id ||
        before.access !== after.access ||
        canonicalizeIJson(before.behavior) !== canonicalizeIJson(after.behavior) ||
        canonicalizeIJson(before.responseEffects ?? []) !== canonicalizeIJson(after.responseEffects ?? []) ||
        canonicalizeIJson(before.errors) !== canonicalizeIJson(after.errors) ||
        (before.behavior.execution === "operation" && !current.operationReadable)
    ) {
        throw new WorkflowError("CAPABILITY_CHANGED", path);
    }
    const violation =
        firstSchemaSubsetViolation(before.input, after.input, `${path}.input`) ??
        firstProjectedOutputViolation(after.output, before.output, `${path}.output`);
    if (violation) {
        throw new WorkflowError("CAPABILITY_SCHEMA_CHANGED", violation);
    }
    return current;
}

/** Transport outages propagate for retry. Only known incompatibilities produce durable diagnostics. */
export function workflowDiagnostic(error: unknown, path: string): WorkflowDiagnostic | undefined {
    if (!(error instanceof WorkflowError)) {
        return undefined;
    }
    if (
        [
            "INVALID_DEFINITION",
            "CAPABILITY_CHANGED",
            "CAPABILITY_SCHEMA_CHANGED",
            "SOURCE_CHANGED",
            "RESOURCE_SCHEMA_CHANGED",
            "PLAN_UNAVAILABLE",
        ].includes(error.code)
    ) {
        return { code: error.code, path: error.path ?? path };
    }
    return undefined;
}
export async function inspectWorkflowPlan(
    plan: WorkflowPlan,
    contracts: WorkflowContracts,
): Promise<WorkflowDiagnostic | undefined> {
    try {
        for (const [id, capability] of Object.entries(plan.capabilities)) {
            await resolveWorkflowCall(capability, contracts, `steps.${id}`);
        }
        if (plan.eventTrigger) {
            if (!contracts.resolveEvent) {
                throw new WorkflowError("INVALID_DEFINITION", "trigger.eventUnavailable");
            }
            const current = await contracts.resolveEvent(
                plan.eventTrigger.owner.namespace,
                plan.eventTrigger.eventType,
            );
            if (
                current.id !== plan.eventTrigger.id ||
                current.digest !== plan.eventTrigger.digest ||
                current.retired ||
                canonicalizeIJson(current.owner) !== canonicalizeIJson(plan.eventTrigger.owner)
            ) {
                const previous = plan.eventTrigger;
                const field =
                    canonicalizeIJson(current.schema) !== canonicalizeIJson(previous.schema)
                        ? ".schema"
                        : current.sensitive !== previous.sensitive
                          ? ".sensitive"
                          : canonicalizeIJson(current.filterKeys ?? null) !==
                              canonicalizeIJson(previous.filterKeys ?? null)
                            ? ".filterKeys"
                            : "";
                throw new WorkflowError("SOURCE_CHANGED", `trigger.source${field}`);
            }
            const use = workflowResourceUse(plan);
            if (plan.eventSchemas?.length && use) {
                if (!contracts.resolveEventSchema) {
                    throw new WorkflowError("INVALID_DEFINITION", "trigger.schemaResolverUnavailable");
                }
                const resolved = await contracts.resolveEventSchema(
                    current,
                    JSON.parse(plan.eventFilterJson ?? "{}"),
                    true,
                );
                const violation = resourceUseViolation(
                    use,
                    applySchemaBindings(current.schema, resolved.bindings, true),
                );
                if (
                    use.resources.some(
                        (previous) =>
                            !resolved.bindings.some(
                                ({ path, declaration, descriptor }) =>
                                    path === previous.path &&
                                    declaration.resolver === previous.resolver &&
                                    descriptor.resourceId === previous.resourceId,
                            ),
                    ) ||
                    violation
                ) {
                    throw new WorkflowError("RESOURCE_SCHEMA_CHANGED", `trigger.data${violation?.slice(1) ?? ""}`);
                }
            }
        }
    } catch (error) {
        const diagnostic = workflowDiagnostic(error, "$");
        if (diagnostic) {
            return diagnostic;
        }
        throw error;
    }
    return undefined;
}
