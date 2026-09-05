import { isSafeNavigationalUrl } from "cms-content/core/utils/safeUrl";
import {
    CMS_BINDING_ATTRIBUTES,
    isCmsQueryParamName,
    isCmsSourceMethod,
    isCmsSourceState,
    isCmsSourceTrigger,
    parseCondition,
    parseRepeat,
    parseSource,
} from "cms-content/interfaces/Editor/BindingSyntax";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const URL_WHITESPACE_OR_CONTROL = /[\u0000-\u0020\u007F]/;
const SOURCE_ID = /^[A-Za-z_$][\w$-]*$/;
const PAGE_STATE_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const PUBLISHED_EVENT = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

const BINDING_ATTRIBUTE_SET = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));
const FORM_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

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
    if (name === CMS_BINDING_ATTRIBUTES.source) {
        const source = parseSource(value);
        return source && isInternalEndpoint(source.url) ? null : "CMS source must use a same-site endpoint";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceBody) {
        return isTypedSourceBody(value) ? null : "CMS source body must be a typed parameter map";
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
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessReset) {
        return value === "true" || value === "false" ? null : "CMS source reset behavior must be true or false";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) {
        return isSafeInternalRedirect(value) ? null : "CMS source success redirect must stay on this site";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirectParam) {
        return isCmsQueryParamName(value) ? null : "CMS source redirect parameter is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourcePublish) {
        const events = value.split(/\s+/).filter(Boolean);
        return events.length > 0 && events.every((event) => PUBLISHED_EVENT.test(event))
            ? null
            : "CMS source publication events are invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.paramSync) {
        return isCmsQueryParamName(value) ? null : "CMS query parameter binding is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.pageState) {
        return PAGE_STATE_KEY.test(value) ? null : "CMS page-state binding is invalid";
    }
    if (name === CMS_BINDING_ATTRIBUTES.sourceStateForce) {
        return isCmsSourceState(value) ? "CMS preview state cannot be persisted" : "CMS source state is invalid";
    }
    return "CMS runtime binding state cannot be persisted";
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
    if (attributes[CMS_BINDING_ATTRIBUTES.sourceTrigger] !== "submit") {
        return 'native forms require cms-source-trigger="submit"';
    }
    for (const name of [
        CMS_BINDING_ATTRIBUTES.sourceBody,
        CMS_BINDING_ATTRIBUTES.sourceId,
        CMS_BINDING_ATTRIBUTES.sourcePublish,
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
        !URL_WHITESPACE_OR_CONTROL.test(value)
    );
}

function isSafeInternalRedirect(value: string): boolean {
    return isSafeNavigationalUrl(value) && isInternalEndpoint(value);
}

function isTypedSourceBody(value: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    return (
        isRecord(parsed) &&
        Object.keys(parsed).length > 0 &&
        Object.entries(parsed).every(([name, source]) => Boolean(name.trim()) && isTypedSourceParam(source))
    );
}

function isTypedSourceParam(value: unknown): boolean {
    if (!isRecord(value) || typeof value.from !== "string") {
        return false;
    }
    const keys = Object.keys(value).sort().join(",");
    if (value.from === "queryParam") {
        return keys === "from,name" && isCmsQueryParamName(value.name as string | undefined);
    }
    if (value.from === "state") {
        return keys === "from,name" && typeof value.name === "string" && PAGE_STATE_KEY.test(value.name);
    }
    if (value.from !== "raw" || keys !== "from,value") {
        return false;
    }
    return (
        (typeof value.value === "string" && Boolean(value.value.trim())) ||
        (typeof value.value === "number" && Number.isFinite(value.value)) ||
        typeof value.value === "boolean"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
