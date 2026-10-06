import { lookup, type Scope } from "../../core/scope";
import { bindingFilter, type FilterMap } from "../../core/interpolate";
import type { CompareOperator, ConditionNode } from "./types";

export function evaluateNode(node: ConditionNode, scope: Scope, filters: FilterMap): unknown {
    if (node.kind === "literal") {
        return node.value;
    }
    if (node.kind === "path") {
        return lookupValue(node.path, scope);
    }
    if (node.kind === "filter") {
        const result = lookup(scope, node.path);
        return result.found
            ? bindingFilter(node.name, filters)!(
                  result.value,
                  node.argument ? lookupValue(node.argument, scope) : undefined,
              )
            : undefined;
    }
    if (node.kind === "not") {
        return !truthy(evaluateNode(node.node, scope, filters));
    }
    if (node.kind === "and") {
        return truthy(evaluateNode(node.left, scope, filters)) && truthy(evaluateNode(node.right, scope, filters));
    }
    if (node.kind === "or") {
        return truthy(evaluateNode(node.left, scope, filters)) || truthy(evaluateNode(node.right, scope, filters));
    }
    if (node.kind === "compare") {
        return compare(
            evaluateNode(node.left, scope, filters),
            evaluateNode(node.right, scope, filters),
            node.operator,
        );
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
