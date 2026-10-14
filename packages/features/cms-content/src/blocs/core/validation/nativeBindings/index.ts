import { isTypedQueryInput, isTypedSourceBody } from "cms-content/blocs/core/validation/nativeBindings/sourceBody";
import { HTML_VOID_ELEMENT_TAGS } from "cms-content/blocs/core/validation/nativeHtml";
import { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import {
    CMS_BINDING_ATTRIBUTES,
    isCmsQueryParamName,
    isCmsSourceMethod,
    isCmsSourceSerialization,
    isCmsSourceSuccessReload,
    isCmsFormValueType,
    isCmsFormEmptyBehavior,
    isCmsSourceTrigger,
    parseCondition,
    parseQuery,
    parseQueries,
    parseQueryListen,
    parseQueryRefresh,
    parseRepeat,
    parseSource,
    parseSyncTarget,
} from "cms-content/blocs/core/markup/bindings";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const URL_WHITESPACE_OR_CONTROL = /[\u0000-\u0020\u007F]/;
const SOURCE_ID = /^[A-Za-z_$][\w$-]*$/;

const BINDING_ATTRIBUTE_SET = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));
const FORM_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const QUERY_RENDERER_FORBIDDEN_TAGS = new Set([...HTML_VOID_ELEMENT_TAGS, "svg"]);

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
    if (name === CMS_BINDING_ATTRIBUTES.source) {
        const source = parseSource(value);
        return source && isInternalEndpoint(source.url) ? null : "CMS source must use a same-site endpoint";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessReload) {
        return isCmsSourceSuccessReload(value)
            ? null
            : "CMS source success reload must identify one to eight unique queries by name";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSerialization) {
        return isCmsSourceSerialization(value) ? null : "CMS source serialization must be typed-json";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceIdempotency) {
        return value === "auto" ? null : "CMS source idempotency must be auto";
    }
    if (name === CMS_BINDING_ATTRIBUTES.formValueType) {
        return isCmsFormValueType(value) ? null : "CMS form value type must be string, number, boolean or json";
    }
    if (name === CMS_BINDING_ATTRIBUTES.formEmpty) {
        return isCmsFormEmptyBehavior(value) ? null : "CMS form empty behavior must be null or omit";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceBody) {
        return isTypedSourceBody(value) ? null : "CMS source body must be a typed parameter map";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceDelay) {
        const delay = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(delay) && delay <= 5000
            ? null
            : "CMS source delay must be an integer between 0 and 5000 milliseconds";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceId) {
        return SOURCE_ID.test(value) ? null : "CMS source id must be a safe identifier";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceMethod) {
        return isCmsSourceMethod(value) && value === value.toUpperCase() ? null : "CMS source method is not controlled";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceTrigger) {
        return isCmsSourceTrigger(value) ? null : "CMS source trigger is not controlled";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceInheritQuery) {
        return value === "true" || value === "false" ? null : "CMS source query inheritance must be true or false";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessReset) {
        return value === "true" || value === "false" ? null : "CMS source reset behavior must be true or false";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) {
        return isSafeInternalRedirect(value) ? null : "CMS source success redirect must stay on this site";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirectParam) {
        return isCmsQueryParamName(value) ? null : "CMS source redirect parameter is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sync) {
        return parseSyncTarget(value) ? null : "CMS sync target is invalid";
    }
    return "CMS runtime binding state cannot be persisted";
}

export function nativeBindingElementIssue(tag: string, attributes: Readonly<Record<string, string>>): string | null {
    const query = attributes[CMS_BINDING_ATTRIBUTES.query];
    const queries = attributes[CMS_BINDING_ATTRIBUTES.queries];
    const source = attributes[CMS_BINDING_ATTRIBUTES.source];
    const sync = attributes[CMS_BINDING_ATTRIBUTES.sync];
    if (query !== undefined && tag === "form") {
        return "CMS queries cannot be declared on forms";
    }
    if (queries !== undefined && tag === "form") {
        return "CMS query imports cannot be declared on forms";
    }
    if ((query !== undefined || queries !== undefined) && QUERY_RENDERER_FORBIDDEN_TAGS.has(tag)) {
        return `CMS queries require an element that can contain rendered content; native <${tag}> cannot own a query renderer`;
    }
    if (query !== undefined && source !== undefined) {
        return "CMS query and CMS source cannot coexist on the same element";
    }
    if (queries !== undefined && source !== undefined) {
        return "CMS query imports and CMS source cannot coexist on the same element";
    }
    if (source !== undefined && tag !== "form") {
        return "CMS sources are reserved for form submissions; use cms-query for reads";
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
        if (
            binding &&
            "contractId" in binding &&
            binding.contractId.startsWith("kernel.") &&
            !["kernel.auth:me", "kernel.auth:methods"].includes(`${binding.contractId}:${binding.capabilityId}`)
        ) {
            return "CMS query targets an unknown Kernel capability";
        }
        if (
            binding &&
            "contractId" in binding &&
            binding.contractId === "kernel.auth" &&
            attributes[CMS_BINDING_ATTRIBUTES.queryInput] !== undefined
        ) {
            return "Kernel authentication queries do not accept input";
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
        CMS_BINDING_ATTRIBUTES.sourceIdempotency,
        CMS_BINDING_ATTRIBUTES.sourceSerialization,
        CMS_BINDING_ATTRIBUTES.sourceSuccessReload,
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

export function nativeFormBindingIssue(attributes: Readonly<Record<string, string>>): string | null {
    for (const forbidden of ["action", "formaction", "method", "target"]) {
        if (attributes[forbidden] !== undefined) {
            return `native forms cannot publish browser ${forbidden}`;
        }
    }
    const source = attributes[CMS_BINDING_ATTRIBUTES.source];
    if (!source || nativeBindingAttributeIssue(CMS_BINDING_ATTRIBUTES.source, source)) {
        return "native forms require a declared CMS source endpoint";
    }
    const method = attributes[CMS_BINDING_ATTRIBUTES.sourceMethod];
    if (!method || !FORM_METHODS.has(method)) {
        return "native forms require a controlled CMS source method";
    }
    const trigger = attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger];
    if (trigger !== "submit" && trigger !== "change") {
        return 'native forms require cms-source-trigger="submit" or "change"';
    }
    if (attributes[CMS_BINDING_ATTRIBUTES.sourceDelay] !== undefined && trigger !== "change") {
        return 'CMS source delay requires cms-source-trigger="change"';
    }
    if (attributes[CMS_BINDING_ATTRIBUTES.sourceSerialization] !== undefined && method === "GET") {
        return "CMS typed-json serialization requires a request-body form method";
    }
    for (const name of [
        CMS_BINDING_ATTRIBUTES.sourceSerialization,
        CMS_BINDING_ATTRIBUTES.sourceSuccessReload,
        CMS_BINDING_ATTRIBUTES.sourceBody,
        CMS_BINDING_ATTRIBUTES.sourceDelay,
        CMS_BINDING_ATTRIBUTES.sourceInheritQuery,
        CMS_BINDING_ATTRIBUTES.sourceId,
        CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect,
        CMS_BINDING_ATTRIBUTES.sourceSuccessRedirectParam,
        CMS_BINDING_ATTRIBUTES.sourceSuccessReset,
    ]) {
        const value = attributes[name];
        const issue = value === undefined ? null : nativeBindingAttributeIssue(name, value);
        if (issue) {
            return issue;
        }
    }
    return null;
}

function isInternalEndpoint(value: string): boolean {
    return (
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !value.includes("\\") &&
        !value.includes("{") &&
        !value.includes("}") &&
        !URL_WHITESPACE_OR_CONTROL.test(value)
    );
}

function isSafeInternalRedirect(value: string): boolean {
    return isSafeNavigationalUrl(value) && isInternalEndpoint(value);
}
