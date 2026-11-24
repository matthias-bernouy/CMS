import { eventProjectionSchema } from "@bernouy/cms-gateway/events";
import { applySchemaBindings } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowPlan, WorkflowExpression } from "workflows/interfaces/definition";
import type { WorkflowResourceUse } from "workflows/interfaces/resource";
import { firstSchemaSubsetViolation } from "@bernouy/ulvia-contracts/compatibility";
export function workflowResourceUse(plan: WorkflowPlan): WorkflowResourceUse | undefined {
    const source = plan.eventTrigger;
    if (!source || !plan.eventSchemas?.length || source.sensitive) {
        return undefined;
    }
    const schema = eventProjectionSchema(applySchemaBindings(source.schema, plan.eventSchemas, true));
    if (!schema) {
        return undefined;
    }
    const paths = new Set<string>();
    const visit = (expression: WorkflowExpression) => {
        if (expression.kind === "trigger") {
            if (expression.path === "" || expression.path === "/data") {
                paths.add("");
            } else if (expression.path.startsWith("/data/")) {
                paths.add(expression.path.slice(5));
            }
        } else if (expression.kind === "object") {
            Object.values(expression.fields).forEach(visit);
        } else if (expression.kind === "array") {
            expression.items.forEach(visit);
        } else if (expression.kind === "compare") {
            visit(expression.left);
            visit(expression.right);
        } else if (expression.kind === "exists") {
            if (expression.value.kind === "trigger" && ["", "/data"].includes(expression.value.path)) {
                return;
            }
            visit(expression.value);
        }
    };
    for (const step of plan.definition.steps) {
        visit(step.kind === "call" ? step.input : step.test);
    }
    visit(plan.definition.output);
    return {
        sourceContractId: source.owner.namespace,
        sourceInstallationId: source.owner.installationId,
        resources: plan.eventSchemas.map(({ path, declaration, descriptor }) => ({
            path,
            resolver: declaration.resolver,
            resourceId: descriptor.resourceId,
            version: descriptor.version,
            digest: descriptor.digest,
        })),
        schema,
        paths: [...paths].sort(),
    };
}
export function workflowConsumedPayload(plan: WorkflowPlan): UlviaSchema | undefined {
    const definition = plan.eventTrigger;
    if (!definition || definition.sensitive) {
        return undefined;
    }
    const full = eventProjectionSchema(applySchemaBindings(definition.schema, plan.eventSchemas ?? [], true));
    const use = workflowResourceUse(plan);
    return full && use ? projectSchema(full, use.paths) : full;
}
export function resourceUseViolation(use: WorkflowResourceUse, candidate: UlviaSchema): string | undefined {
    const next = eventProjectionSchema(candidate);
    if (!next) {
        return use.paths.length ? "$" : undefined;
    }
    if (!use.paths.length) {
        return undefined;
    }
    const before = projectSchema(use.schema, use.paths);
    const after = projectSchema(next, use.paths);
    return missingFields(before, after, "$") ?? firstSchemaSubsetViolation(after, before, "$") ?? undefined;
}
function projectSchema(schema: UlviaSchema, paths: readonly string[]): UlviaSchema {
    if (paths.includes("") || schema.type !== "object") {
        return schema;
    }
    const byName = new Map<string, string[]>();
    for (const path of paths) {
        const parts = path.split("/");
        const name = parts[1]!.replaceAll("~1", "/").replaceAll("~0", "~");
        byName.set(name, [...(byName.get(name) ?? []), parts.length > 2 ? `/${parts.slice(2).join("/")}` : ""]);
    }
    const properties = Object.fromEntries(
        [...byName].flatMap(([name, children]) =>
            schema.properties[name] ? [[name, projectSchema(schema.properties[name]!, children)]] : [],
        ),
    );
    return {
        type: "object",
        ...(schema.nullable ? { nullable: true } : {}),
        properties,
        required: schema.required.filter((name) => Object.hasOwn(properties, name)),
    };
}
function missingFields(before: UlviaSchema, after: UlviaSchema, path: string): string | undefined {
    if (before.type !== "object" || after.type !== "object") {
        return undefined;
    }
    for (const [name, schema] of Object.entries(before.properties)) {
        const next = after.properties[name];
        const location = `${path}.${name}`;
        if (!next) {
            return location;
        }
        const missing = missingFields(schema, next, location);
        if (missing) {
            return missing;
        }
    }
    return undefined;
}
