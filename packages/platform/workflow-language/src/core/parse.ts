import { containsResolvedSchema } from "@bernouy/ulvia-contracts/resolution";
import { z } from "zod";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { parseUlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowExpression, WorkflowDefinition } from "../interfaces/definition";
import { workflowIssue } from "./errors";
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const path = z
    .string()
    .max(1024)
    .refine((value) => value === "" || value.startsWith("/"));
const expression: z.ZodType<WorkflowExpression> = z.lazy(() =>
    z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("literal"), value: z.unknown() }),
        z.strictObject({ kind: z.literal("input"), path }),
        z.strictObject({ kind: z.literal("parameter"), path }),
        z.strictObject({ kind: z.literal("trigger"), path }),
        z.strictObject({ kind: z.literal("step"), stepId: id, path }),
        z.strictObject({ kind: z.literal("error"), stepId: id, path }),
        z.strictObject({ kind: z.literal("object"), fields: z.record(z.string().max(256), expression) }),
        z.strictObject({ kind: z.literal("array"), items: z.array(expression).max(256).readonly() }),
        z.strictObject({ kind: z.literal("exists"), value: expression }),
        z.strictObject({
            kind: z.literal("compare"),
            operator: z.enum(["eq", "gt", "lt"]),
            left: expression,
            right: expression,
        }),
    ]),
);
const target = z.strictObject({ contractId: z.string().max(193), capabilityId: z.string().max(128) });
const definition = z.strictObject({
    format: z.literal("ulvia-workflow/v1"),
    inputSchema: z.unknown(),
    parametersSchema: z.unknown(),
    outputSchema: z.unknown(),
    trigger: z
        .strictObject({
            kind: z.literal("event"),
            contractId: z.string().max(225),
            eventType: z.string().max(128),
            filter: expression.optional(),
        })
        .optional(),
    entry: id,
    steps: z
        .array(
            z.discriminatedUnion("kind", [
                z.strictObject({
                    id,
                    kind: z.literal("call"),
                    target,
                    input: expression,
                    next: id.nullable(),
                    onError: z.record(z.string().max(128), id),
                }),
                z.strictObject({
                    id,
                    kind: z.literal("condition"),
                    test: expression,
                    then: id.nullable(),
                    otherwise: id.nullable(),
                }),
            ]),
        )
        .min(1)
        .max(128)
        .readonly(),
    output: expression,
});
export function parseWorkflow(json: string): WorkflowDefinition {
    let value: z.output<typeof definition>;
    try {
        value = definition.parse(parseStrictJson(new TextEncoder().encode(json), 1048576, 64));
    } catch (error) {
        workflowIssue(error instanceof z.ZodError ? (error.issues[0]?.path.join(".") ?? "$") : "$");
    }
    const parseSchema = (input: unknown, path: string) => {
        try {
            const schema = parseUlviaSchema(input);
            if (containsResolvedSchema(schema)) {
                workflowIssue(`${path}.resolvedUnsupported`);
            }
            return schema;
        } catch {
            return workflowIssue(path);
        }
    };
    const inputSchema = parseSchema(value.inputSchema, "inputSchema");
    const parametersSchema = parseSchema(value.parametersSchema, "parametersSchema");
    if (parametersSchema.type !== "object") {
        workflowIssue("parametersSchema");
    }
    const outputSchema = parseSchema(value.outputSchema, "outputSchema");
    if (inputSchema.type !== "object") {
        workflowIssue("inputSchema");
    }
    let count = 0;
    const visit = (expr: WorkflowExpression, depth: number) => {
        count++;
        if (count > 4096 || depth > 24) {
            workflowIssue("expressions.limit");
        }
        const children =
            expr.kind === "object"
                ? Object.values(expr.fields)
                : expr.kind === "array"
                  ? expr.items
                  : expr.kind === "compare"
                    ? [expr.left, expr.right]
                    : expr.kind === "exists"
                      ? [expr.value]
                      : [];
        if (children.length > 256) {
            workflowIssue("expressions.fields");
        }
        for (const child of children) {
            visit(child, depth + 1);
        }
    };
    for (const step of value.steps) {
        visit(step.kind === "call" ? step.input : step.test, 1);
    }
    visit(value.output, 1);
    return { ...value, inputSchema, outputSchema, parametersSchema };
}
