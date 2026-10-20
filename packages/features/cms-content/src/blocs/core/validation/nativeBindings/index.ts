import { isTypedBindingInput, isTypedQueryInput } from "cms-content/blocs/core/validation/nativeBindings/bindingInput";
import { HTML_VOID_ELEMENT_TAGS } from "cms-content/blocs/core/validation/nativeHtml";
import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { dynamicInternalHrefIssue } from "cms-content/blocs/core/validation/nativeAttributeValues";
import {
    CMS_BINDING_ATTRIBUTES,
    isCmsQueryParamName,
    isCmsFormValueType,
    isCmsFormEmptyBehavior,
    parseCondition,
    parseCase,
    parseMatch,
    parseMutation,
    parseQuery,
    parseQueries,
    parseQueryListen,
    parseQueryRefresh,
    parseRepeat,
    parseSyncSelection,
    parseSyncTarget,
} from "cms-content/blocs/core/markup/bindings";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

const BINDING_ATTRIBUTE_SET = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));

export function isCmsBindingAttribute(attribute: string): boolean {
    return BINDING_ATTRIBUTE_SET.has(attribute.toLowerCase());
}

export function nativeBindingAttributeIssue(attribute: string, value: string): string | null {
    const name = attribute.toLowerCase();
    if (CONTROL_CHARACTER.test(value)) {
        return `binding attribute "${attribute}" contains control characters`;
    }
    if (name === CMS_BINDING_ATTRIBUTES.condition) {
        return parseCondition(value) ? null : "CMS condition must not be empty";
    }
    if (name === CMS_BINDING_ATTRIBUTES.match) {
        return parseMatch(value) ? null : "CMS match must contain a valid expression";
    }
    if (name === CMS_BINDING_ATTRIBUTES.case) {
        return parseCase(value) !== undefined ? null : "CMS case must contain one literal value";
    }
    if (name === CMS_BINDING_ATTRIBUTES.repeat) {
        return parseRepeat(value) ? null : "CMS repeat binding must not be empty";
    }
    if (name === CMS_BINDING_ATTRIBUTES.query) {
        return parseQuery(value) ? null : "CMS query must identify a capability or synchronized state as name";
    }
    if (name === CMS_BINDING_ATTRIBUTES.queries) {
        return parseQueries(value) ? null : "CMS query imports must identify one to sixteen unique states as names";
    }
    if (name === CMS_BINDING_ATTRIBUTES.queryInput) {
        return isTypedQueryInput(value) ? null : "CMS query input must be a typed parameter map";
    }
    if (name === CMS_BINDING_ATTRIBUTES.queryListen) {
        return parseQueryListen(value) ? null : "CMS query listeners must identify one to sixteen unique states";
    }
    if (name === CMS_BINDING_ATTRIBUTES.queryRefresh) {
        return parseQueryRefresh(value) ? null : "CMS query refresh policy is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.mutation) {
        return parseMutation(value) ? null : "CMS mutation must identify one command capability as name";
    }
    if (name === CMS_BINDING_ATTRIBUTES.mutationInput) {
        return isTypedBindingInput(value) ? null : "CMS mutation input must be a typed parameter map";
    }
    if (name === CMS_BINDING_ATTRIBUTES.mutationReset) {
        return value === "true" || value === "false" ? null : "CMS mutation reset behavior must be true or false";
    }
    if (name === CMS_BINDING_ATTRIBUTES.mutationRedirect) {
        return isSafeInternalRedirect(value) ? null : "CMS mutation redirect must stay on this site";
    }
    if (name === CMS_BINDING_ATTRIBUTES.mutationRedirectParam) {
        return isCmsQueryParamName(value) ? null : "CMS mutation redirect parameter is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.formValueType) {
        return isCmsFormValueType(value) ? null : "CMS form value type must be string, number, boolean or json";
    }
    if (name === CMS_BINDING_ATTRIBUTES.formEmpty) {
        return isCmsFormEmptyBehavior(value) ? null : "CMS form empty behavior must be null or omit";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sync) {
        return parseSyncTarget(value) ? null : "CMS sync target is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.syncSelect) {
        return parseSyncSelection(value) ? null : "CMS sync selection must contain one to sixteen unique paths";
    }
    return "CMS runtime binding state cannot be persisted";
}

export function nativeBindingElementIssue(tag: string, attributes: Readonly<Record<string, string>>): string | null {
    const query = attributes[CMS_BINDING_ATTRIBUTES.query];
    const queries = attributes[CMS_BINDING_ATTRIBUTES.queries];
    const mutation = attributes[CMS_BINDING_ATTRIBUTES.mutation];
    const sync = attributes[CMS_BINDING_ATTRIBUTES.sync];
    const syncSelect = attributes[CMS_BINDING_ATTRIBUTES.syncSelect];
    const match = attributes[CMS_BINDING_ATTRIBUTES.match];
    if (match !== undefined && isQueryRendererForbiddenTag(tag)) {
        return `CMS matches require an element that can contain rendered cases; native <${tag}> cannot own a match`;
    }
    if (match !== undefined && (query !== undefined || queries !== undefined || mutation !== undefined)) {
        return "CMS match must be nested inside query or mutation content, not declared on the binding owner";
    }
    if (query !== undefined && tag === "form") {
        return "CMS queries cannot be declared on forms";
    }
    if (queries !== undefined && tag === "form") {
        return "CMS query imports cannot be declared on forms";
    }
    if ((query !== undefined || queries !== undefined) && isQueryRendererForbiddenTag(tag)) {
        return `CMS queries require an element that can contain rendered content; native <${tag}> cannot own a query renderer`;
    }
    if ((query !== undefined || queries !== undefined) && mutation !== undefined) {
        return "CMS queries and CMS mutation cannot coexist on the same element";
    }
    if (mutation !== undefined && tag !== "form") {
        return "CMS mutations are reserved for form submissions";
    }
    const mutationBinding = mutation === undefined ? null : parseMutation(mutation);
    if (mutationBinding?.contractId.startsWith("kernel.")) {
        return "CMS mutations cannot target Kernel-owned capabilities";
    }
    if (query !== undefined) {
        const binding = parseQuery(query);
        const imported = parseQueries(queries);
        if (binding && imported?.some(({ name }) => name === binding.name)) {
            return `CMS query name ${JSON.stringify(binding.name)} conflicts with an imported query`;
        }
        if (binding && "sync" in binding && sync !== undefined) {
            return "synchronized-state queries cannot republish the state they consume";
        }
        if (binding && "contractId" in binding && sync !== undefined && parseSyncTarget(sync)?.scope === "param") {
            return "remote queries cannot publish structured state to URL parameters";
        }
        if (
            binding &&
            "sync" in binding &&
            (attributes[CMS_BINDING_ATTRIBUTES.queryInput] !== undefined ||
                attributes[CMS_BINDING_ATTRIBUTES.queryListen] !== undefined ||
                attributes[CMS_BINDING_ATTRIBUTES.queryRefresh] !== undefined)
        ) {
            return "synchronized-state queries cannot declare remote query controls";
        }
        if (binding && "contractId" in binding && binding.contractId.startsWith("kernel.")) {
            return "CMS queries cannot target Kernel-owned capabilities";
        }
    }
    if (queries !== undefined && query === undefined && sync !== undefined) {
        return "CMS query imports cannot publish synchronized state without a primary query";
    }
    if (
        sync !== undefined &&
        query === undefined &&
        queries === undefined &&
        !["form", "input", "select", "textarea"].includes(tag) &&
        !tag.includes("-")
    ) {
        return "CMS sync requires a query or form control";
    }
    if (sync !== undefined && tag === "form" && parseSyncTarget(sync)?.scope === "param") {
        return "forms cannot publish structured state to URL parameters";
    }
    if (sync !== undefined && tag === "input" && attributes.type?.toLowerCase() === "file") {
        return "file inputs belong to form submission and cannot synchronize browser state";
    }
    if (sync !== undefined && tag === "select" && attributes.multiple !== undefined) {
        return "multiple selects require an explicit collection value contract and cannot synchronize browser state";
    }
    if (syncSelect !== undefined && sync === undefined) {
        return "CMS sync selection requires cms-sync";
    }
    if (syncSelect !== undefined && query === undefined && tag !== "form") {
        return "CMS sync selection is reserved for structured query and mutation producers";
    }
    for (const name of [
        CMS_BINDING_ATTRIBUTES.queryInput,
        CMS_BINDING_ATTRIBUTES.queryListen,
        CMS_BINDING_ATTRIBUTES.queryRefresh,
    ]) {
        if (attributes[name] !== undefined && query === undefined) {
            return `CMS query attribute "${name}" requires cms-query`;
        }
    }
    for (const name of [
        CMS_BINDING_ATTRIBUTES.mutationInput,
        CMS_BINDING_ATTRIBUTES.mutationRedirect,
        CMS_BINDING_ATTRIBUTES.mutationRedirectParam,
        CMS_BINDING_ATTRIBUTES.mutationReset,
    ]) {
        if (attributes[name] !== undefined && tag !== "form") {
            return `CMS submission attribute "${name}" requires a form`;
        }
    }
    for (const name of [CMS_BINDING_ATTRIBUTES.formValueType, CMS_BINDING_ATTRIBUTES.formEmpty]) {
        if (attributes[name] !== undefined && !["input", "select", "textarea"].includes(tag) && !tag.includes("-")) {
            return `CMS form attribute "${name}" requires a control`;
        }
    }
    return null;
}

function isQueryRendererForbiddenTag(tag: string): boolean {
    return tag === "svg" || HTML_VOID_ELEMENT_TAGS.has(tag);
}

export function nativeFormBindingIssue(attributes: Readonly<Record<string, string>>): string | null {
    for (const forbidden of ["action", "formaction", "method", "target"]) {
        if (attributes[forbidden] !== undefined) {
            return `native forms cannot publish browser ${forbidden}`;
        }
    }
    const mutation = attributes[CMS_BINDING_ATTRIBUTES.mutation];
    if (mutation) {
        if (nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.mutation, mutation)) {
            return "native forms require a declared CMS mutation";
        }
        for (const name of [
            CMS_BINDING_ATTRIBUTES.mutationInput,
            CMS_BINDING_ATTRIBUTES.mutationRedirect,
            CMS_BINDING_ATTRIBUTES.mutationRedirectParam,
            CMS_BINDING_ATTRIBUTES.mutationReset,
        ]) {
            const value = attributes[name];
            const issue = value === undefined ? null : nativeBindingAttributeIssue(name, value);
            if (issue) {
                return issue;
            }
        }
        return null;
    }
    return "native forms require a declared CMS mutation";
}

function isSafeInternalRedirect(value: string): boolean {
    if (value.includes("{{")) {
        return dynamicInternalHrefIssue(value) === null;
    }
    return (
        isSafeNavigationalUrl(value) &&
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !value.includes("\\") &&
        !value.includes("{") &&
        !value.includes("}") &&
        !/[\u0000-\u0020\u007F]/.test(value)
    );
}
