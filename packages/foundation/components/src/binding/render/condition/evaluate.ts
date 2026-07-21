import { lookup, type Scope } from "../../scope";
import type { CompareOperator, ConditionNode } from "./types";

export function evaluateNode(node: ConditionNode, scope: Scope): unknown {
    if (node.kind === "literal") {
        return node.value;
    }
    if (node.kind === "path") {
        return lookupValue(node.path, scope);
    }
    if (node.kind === "not") {
        return !truthy(evaluateNode(node.node, scope));
    }
    if (node.kind === "and") {
        return truthy(evaluateNode(node.left, scope)) && truthy(evaluateNode(node.right, scope));
    }
    if (node.kind === "or") {
        return truthy(evaluateNode(node.left, scope)) || truthy(evaluateNode(node.right, scope));
    }
    if (node.kind === "compare") {
        return compare(evaluateNode(node.left, scope), evaluateNode(node.right, scope), node.operator);
    }
    return false;
}

function lookupValue(path: string, scope: Scope): unknown {
    const res = lookup(scope, path.trim());
    return res.found ? res.value : undefined;
}

function truthy(value: unknown): boolean {
    return Boolean(value);
}

function compare(left: unknown, right: unknown, operator: CompareOperator): boolean {
    if (operator === "==") {
        return Object.is(left, right);
    }
    if (operator === "!=") {
        return !Object.is(left, right);
    }

    if (typeof left === "number" && typeof right === "number" && Number.isFinite(left) && Number.isFinite(right)) {
        if (operator === ">") {
            return left > right;
        }
        if (operator === ">=") {
            return left >= right;
        }
        if (operator === "<") {
            return left < right;
        }
        return left <= right;
    }

    if (typeof left === "string" && typeof right === "string") {
        if (operator === ">") {
            return left > right;
        }
        if (operator === ">=") {
            return left >= right;
        }
        if (operator === "<") {
            return left < right;
        }
        return left <= right;
    }

    return false;
}
