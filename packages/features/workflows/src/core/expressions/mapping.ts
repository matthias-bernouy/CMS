import { z } from "@bernouy/ulvia-sdk";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowExpression } from "workflows/interfaces/definition";
import { requireExpression } from "./assignment";
import { evaluateExpression } from "./evaluate";
import { WorkflowError } from "../errors";
const pointer = z
    .string()
    .max(4096)
    .refine((value) => value === "" || value.startsWith("/"));
const mapping: z.ZodType<WorkflowExpression> = z.lazy(() =>
    z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("literal"), value: z.unknown() }),
        z.strictObject({ kind: z.literal("input"), path: pointer }),
        z.strictObject({ kind: z.literal("object"), fields: z.record(z.string().max(256), mapping) }),
        z.strictObject({ kind: z.literal("array"), items: z.array(mapping).max(256).readonly() }),
        z.strictObject({ kind: z.literal("exists"), value: mapping }),
        z.strictObject({
            kind: z.literal("compare"),
            operator: z.enum(["eq", "gt", "lt"]),
            left: mapping,
            right: mapping,
        }),
    ]),
);
export function parseJsonMapping(json: string): WorkflowExpression {
    let expression: WorkflowExpression;
    try {
        expression = mapping.parse(parseStrictJson(new TextEncoder().encode(json), 1048576, 24));
    } catch {
        throw new WorkflowError("INVALID_DEFINITION", "mapping");
    }
    let count = 0;
    const visit = (node: WorkflowExpression, depth: number) => {
        if (++count > 256 || depth > 16) {
            throw new WorkflowError("INVALID_DEFINITION", "mapping.limit");
        }
        const children =
            node.kind === "object"
                ? Object.values(node.fields)
                : node.kind === "array"
                  ? node.items
                  : node.kind === "compare"
                    ? [node.left, node.right]
                    : node.kind === "exists"
                      ? [node.value]
                      : [];
        for (const child of children) {
            visit(child, depth + 1);
        }
    };
    visit(expression, 1);
    return expression;
}
export function compileJsonMapping(json: string, input: UlviaSchema, output: UlviaSchema): WorkflowExpression {
    const expression = parseJsonMapping(json);
    requireExpression(expression, { input, steps: new Map(), errors: new Map() }, output, "mapping");
    return expression;
}
export function evaluateJsonMapping(expression: WorkflowExpression, input: unknown, maximumBytes?: number): unknown {
    return evaluateExpression(expression, { input, steps: {}, errors: {} }, maximumBytes);
}
