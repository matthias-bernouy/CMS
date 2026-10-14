import { ContentValidationError } from "cms-content/application/core/validation/errors";
import {
    CMS_BINDING_ATTRIBUTES,
    interpolationExpressions,
    parseCase,
    parseCondition,
    parseMatch,
    parseMutation,
    parseQueries,
    parseQuery,
    parseRepeat,
    parseRepeatRange,
} from "cms-content/blocs/core/markup/bindings";
import type { BindingFacts, BindingScope, BindingVariable } from "./model";
import { addVariable, emptyFacts, withFact } from "./model";
import { analyzeBindingExpression, factsForMatchCase } from "./expressions";
import { resolveBindingPath } from "./paths";
import type { BindingAnalysisOptions, BindingCapability } from "./types";
import { validateOperationCoverage } from "./coverage";

const IGNORED_ATTRIBUTES = new Set<string>([
    CMS_BINDING_ATTRIBUTES.query,
    CMS_BINDING_ATTRIBUTES.queries,
    CMS_BINDING_ATTRIBUTES.queryInput,
    CMS_BINDING_ATTRIBUTES.queryListen,
    CMS_BINDING_ATTRIBUTES.queryRefresh,
    CMS_BINDING_ATTRIBUTES.mutation,
    CMS_BINDING_ATTRIBUTES.mutationInput,
    CMS_BINDING_ATTRIBUTES.mutationIdempotency,
    CMS_BINDING_ATTRIBUTES.mutationInvalidates,
    CMS_BINDING_ATTRIBUTES.mutationRedirect,
    CMS_BINDING_ATTRIBUTES.mutationRedirectParam,
    CMS_BINDING_ATTRIBUTES.mutationReset,
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
    capabilities: ReadonlyMap<string, BindingCapability>,
    requireResolution: boolean,
): void {
    const declaration = operationVariable(element, capabilities, requireResolution);
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
    validateInterpolations(element, scope, facts, declaration?.name);
    if (declaration?.variable.kind === "operation") {
        validateOperationCoverage(element, declaration.name, declaration.variable.capability);
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

function operationVariable(
    element: Element,
    capabilities: ReadonlyMap<string, BindingCapability>,
    requireResolution: boolean,
): { readonly name: string; readonly variable: BindingVariable } | null {
    const query = parseQuery(element.getAttribute(CMS_BINDING_ATTRIBUTES.query) ?? "");
    const mutation = parseMutation(element.getAttribute(CMS_BINDING_ATTRIBUTES.mutation) ?? "");
    const binding = query ?? mutation;
    if (!binding) {
        return null;
    }
    if ("sync" in binding || binding.contractId.startsWith("kernel.")) {
        return { name: binding.name, variable: { kind: "unknown" } };
    }
    const capability = capabilities.get(targetKey(binding.contractId, binding.capabilityId));
    if (!capability) {
        if (requireResolution) {
            throw new ContentValidationError(
                "content",
                `CMS operation ${binding.contractId}:${binding.capabilityId} cannot be resolved to an exact contract schema`,
            );
        }
        return { name: binding.name, variable: { kind: "unknown" } };
    }
    return { name: binding.name, variable: { kind: "operation", capability } };
}

function validateInterpolations(
    element: Element,
    scope: BindingScope,
    facts: BindingFacts,
    operationName?: string,
): void {
    for (const attribute of element.getAttributeNames()) {
        if (IGNORED_ATTRIBUTES.has(attribute)) {
            continue;
        }
        const attributeFacts =
            attribute === "data-cms-page-suffix" && operationName
                ? withFact(facts, `${operationName}.outcome.kind`, "success")
                : facts;
        for (const expression of interpolationExpressions(element.getAttribute(attribute) ?? "") ?? []) {
            analyzeBindingExpression(expression, scope, attributeFacts);
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
    if (variable.kind === "unknown") {
        return variable;
    }
    if (variable.kind !== "schema" || variable.schema.type !== "array") {
        throw new ContentValidationError("content", `CMS repeat path ${JSON.stringify(path)} must resolve to an array`);
    }
    return { kind: "schema", schema: variable.schema.items };
}

function targetKey(contractId: string, capabilityId: string): string {
    return `${contractId}\0${capabilityId}`;
}
