import { parseConditionExpression } from "./parser";
import type { ConditionNode } from "./types";

export function* conditionOperands(node: ConditionNode): Generator<ConditionNode> {
    if (node.kind === "not") {
        yield* conditionOperands(node.node);
    } else if (node.kind === "and" || node.kind === "or" || node.kind === "compare") {
        yield* conditionOperands(node.left);
        yield* conditionOperands(node.right);
    } else {
        yield node;
    }
}

export function collectConditionReferences(expression: string): string[] {
    const refs: string[] = [];
    try {
        for (const node of conditionOperands(parseConditionExpression(expression))) {
            if (node.kind === "path" || node.kind === "filter") {
                refs.push(node.path);
            }
            if (node.kind === "filter" && node.argument) {
                refs.push(node.argument);
            }
        }
    } catch {
        const fallback = /[A-Za-z_$][\w$]*(?:\.[\w$-]+)*/g;
        for (const match of expression.matchAll(fallback)) {
            refs.push(match[0]);
        }
    }
    return refs;
}
