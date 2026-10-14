import { ContentValidationError } from "cms-content/application/core/validation/errors";
import {
    CMS_BINDING_ATTRIBUTES,
    interpolationExpressions,
    parseCase,
    parseCondition,
    parseMatch,
    parseQueries,
    parseQuery,
    parseRepeat,
    parseRepeatRange,
} from "cms-content/blocs/core/markup/bindings";
import type { BindingFacts, BindingScope, BindingVariable } from "./model";
import { addVariable, emptyFacts } from "./model";
import { analyzeBindingExpression, factsForMatchCase } from "./expressions";
import { resolveBindingPath } from "./paths";
import type { BindingAnalysisOptions, BindingQueryCapability } from "./types";
import { validateQueryCoverage } from "./coverage";

const IGNORED_ATTRIBUTES = new Set<string>([
    CMS_BINDING_ATTRIBUTES.query,
    CMS_BINDING_ATTRIBUTES.queries,
    CMS_BINDING_ATTRIBUTES.queryInput,
    CMS_BINDING_ATTRIBUTES.queryListen,
    CMS_BINDING_ATTRIBUTES.queryRefresh,
    CMS_BINDING_ATTRIBUTES.repeat,
    CMS_BINDING_ATTRIBUTES.condition,
    CMS_BINDING_ATTRIBUTES.match,
    CMS_BINDING_ATTRIBUTES.case,
]);

export function validateDocumentBindings(document: Document, options: BindingAnalysisOptions = {}): void {
    const capabilities = new Map(
        (options.capabilities ?? []).map((capability) => [
            targetKey(capability.contractId, capability.capabilityId),
            capability,
        ]),
    );
    for (const child of Array.from(document.body.children)) {
        walk(child, new Map(), emptyFacts(), capabilities, options.requireCapabilityResolution === true);
    }
}

function walk(
    element: Element,
    parentScope: BindingScope,
    parentFacts: BindingFacts,
    capabilities: ReadonlyMap<string, BindingQueryCapability>,
    requireResolution: boolean,
): void {
    const declaration = queryVariable(element, capabilities, requireResolution);
    let scope = declaration ? addVariable(parentScope, declaration.name, declaration.variable) : parentScope;
    for (const imported of parseQueries(element.getAttribute(CMS_BINDING_ATTRIBUTES.queries)) ?? []) {
        scope = addVariable(scope, imported.name, { kind: "unknown" });
    }
    const repeat = parseRepeat(element.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "");
    if (repeat?.alias) {
        const range = parseRepeatRange(element.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "");
        scope = addVariable(
            scope,
            repeat.alias,
            range
                ? { kind: "schema", schema: { type: "integer" } }
                : repeatedVariable(resolveBindingPath(repeat.path, scope, parentFacts), repeat.path),
        );
    } else if (repeat && !parseRepeatRange(element.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "")) {
        resolveBindingPath(repeat.path, scope, parentFacts);
    }

    let facts = parentFacts;
    const condition = parseCondition(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition) ?? "");
    if (condition) {
        facts = analyzeBindingExpression(condition, scope, facts).whenTrue;
    }
    validateInterpolations(element, scope, facts);
    if (declaration?.variable.kind === "query") {
        validateQueryCoverage(element, declaration.name, declaration.variable.capability);
    }

    const match = parseMatch(element.getAttribute(CMS_BINDING_ATTRIBUTES.match) ?? "");
    if (!match) {
        for (const child of Array.from(element.children)) {
            walk(child, scope, facts, capabilities, requireResolution);
        }
        return;
    }
    analyzeBindingExpression(match, scope, facts);
    for (const child of Array.from(element.children)) {
        const caseValue = parseCase(child.getAttribute(CMS_BINDING_ATTRIBUTES.case) ?? "");
        walk(
            child,
            scope,
            caseValue === undefined ? facts : factsForMatchCase(match, caseValue, scope, facts),
            capabilities,
            requireResolution,
        );
    }
}

function queryVariable(
    element: Element,
    capabilities: ReadonlyMap<string, BindingQueryCapability>,
    requireResolution: boolean,
): { readonly name: string; readonly variable: BindingVariable } | null {
    const query = parseQuery(element.getAttribute(CMS_BINDING_ATTRIBUTES.query) ?? "");
    if (!query) {
        return null;
    }
    if ("sync" in query || query.contractId.startsWith("kernel.")) {
        return { name: query.name, variable: { kind: "unknown" } };
    }
    const capability = capabilities.get(targetKey(query.contractId, query.capabilityId));
    if (!capability) {
        if (requireResolution) {
            throw new ContentValidationError(
                "content",
                `CMS query ${query.contractId}:${query.capabilityId} cannot be resolved to an exact contract schema`,
            );
        }
        return { name: query.name, variable: { kind: "unknown" } };
    }
    return { name: query.name, variable: { kind: "query", capability } };
}

function validateInterpolations(element: Element, scope: BindingScope, facts: BindingFacts): void {
    for (const attribute of element.getAttributeNames()) {
        if (IGNORED_ATTRIBUTES.has(attribute)) {
            continue;
        }
        for (const expression of interpolationExpressions(element.getAttribute(attribute) ?? "") ?? []) {
            analyzeBindingExpression(expression, scope, facts);
        }
    }
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType !== 3) {
            continue;
        }
        for (const expression of interpolationExpressions(node.textContent ?? "") ?? []) {
            analyzeBindingExpression(expression, scope, facts);
        }
    }
}

function repeatedVariable(variable: BindingVariable, path: string): BindingVariable {
    if (variable.kind !== "schema" || variable.schema.type !== "array") {
        throw new ContentValidationError("content", `CMS repeat path ${JSON.stringify(path)} must resolve to an array`);
    }
    return { kind: "schema", schema: variable.schema.items };
}

function targetKey(contractId: string, capabilityId: string): string {
    return `${contractId}\0${capabilityId}`;
}
