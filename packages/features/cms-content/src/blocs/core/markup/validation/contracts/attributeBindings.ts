import {
    expressionOperands,
    expressionValueType,
    isStableValueFilter,
} from "cms-content/blocs/core/markup/expression/inspect";
import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";
import type { ExpressionNode } from "cms-content/blocs/core/markup/expression/types";
import { interpolationExpressions, parseInterpolation } from "cms-content/blocs/core/markup/bindings/operation";

export type BoundAttributeValueKind = "boolean" | "string" | "declared-string" | "number" | "integer";

/** Returns undefined for a static value, otherwise the dynamic binding issue. */
export function boundAttributeValueIssue(value: string, kind: BoundAttributeValueKind): string | null | undefined {
    if (!value.includes("{{") && !value.includes("}}")) {
        return undefined;
    }
    const expressions = interpolationExpressions(value);
    if (!expressions) {
        return "attribute interpolation has unmatched or empty delimiters";
    }
    const exact = parseInterpolation(value);
    if (!exact && kind !== "string" && kind !== "declared-string") {
        return `${kind} attributes require one exact interpolation`;
    }
    try {
        const nodes = expressions.map(parseBindingExpression);
        const unknownFilter = nodes
            .flatMap((node) => [...expressionOperands(node)])
            .find((node) => node.kind === "filter" && !isStableValueFilter(node.name));
        if (unknownFilter?.kind === "filter") {
            return `attribute interpolation uses unknown filter ${JSON.stringify(unknownFilter.name)}`;
        }
        if (!exact && nodes.some((node) => node.kind !== "path" && node.kind !== "filter")) {
            return "mixed attribute interpolation accepts paths and filters only";
        }
        return exact ? exactExpressionIssue(nodes[0]!, kind) : null;
    } catch (error) {
        return `invalid attribute interpolation: ${error instanceof Error ? error.message : String(error)}`;
    }
}

function exactExpressionIssue(node: ExpressionNode, kind: BoundAttributeValueKind): string | null {
    const valueType = expressionValueType(node);
    if (kind === "boolean" && valueType !== "boolean" && valueType !== "unknown") {
        return `boolean attribute binding cannot produce ${valueType}`;
    }
    if (kind === "declared-string" && valueType !== "string" && valueType !== "number" && valueType !== "unknown") {
        return `string setting binding cannot produce ${valueType}; use the string filter for boolean data`;
    }
    if ((kind === "number" || kind === "integer") && valueType !== "number" && valueType !== "unknown") {
        return `${kind} attribute binding cannot produce ${valueType}`;
    }
    if (
        kind === "integer" &&
        node.kind === "literal" &&
        typeof node.value === "number" &&
        !Number.isSafeInteger(node.value)
    ) {
        return "integer attribute binding literal must be a safe integer";
    }
    return null;
}
