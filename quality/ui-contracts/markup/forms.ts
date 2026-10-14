import type { UiFinding, UiSource } from "../contracts/types";
import { markupFinding } from "./findings";
import { DYNAMIC_VALUE, type MarkupTag } from "./types";

export function inspectForms(source: UiSource, tag: MarkupTag): UiFinding[] {
    const attrs = tag.attributes;
    const sourceAttr = attrs.get("cms-source");
    if (!sourceAttr?.value.trim()) {
        return [];
    }
    const findings: UiFinding[] = [];
    const report = (
        attribute: string,
        rule: string,
        severity: UiFinding["severity"],
        message: string,
        recommendation: string,
    ): void => {
        findings.push(
            markupFinding(source, attrs.get(attribute)?.offset ?? tag.offset, {
                rule,
                severity,
                message,
                recommendation,
            }),
        );
    };
    const trigger = attrs.get("cms-source-trigger")?.value.trim() || "submit";
    const method = attrs.get("cms-source-method")?.value.trim().toUpperCase();
    if (tag.name !== "form") {
        report(
            "cms-source",
            "source-form-owner",
            "ERROR",
            "cms-source is reserved for native form submissions.",
            "Use cms-query for reads, or move the mutation binding onto its owning native form.",
        );
        return findings;
    }
    if (!dynamic(trigger) && !["submit", "change"].includes(trigger)) {
        report(
            "cms-source-trigger",
            "source-trigger-contract",
            "ERROR",
            "cms-source-trigger only accepts submit or change.",
            "Use a native form event trigger: submit or change.",
        );
    }
    if (method && !dynamic(method) && !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        report(
            "cms-source-method",
            "source-method-contract",
            "ERROR",
            "cms-source-method uses an unsupported form method.",
            "Use GET, POST, PUT, PATCH, or DELETE.",
        );
    }
    const formSubmission = ["submit", "change"].includes(trigger);
    if (!formSubmission) {
        return findings;
    }
    const body = attrs.get("cms-source-body")?.value;
    if (body?.trim() && !dynamic(body) && method !== "GET" && !validBody(body)) {
        report(
            "cms-source-body",
            "source-body-contract",
            "WARNING",
            "The literal cms-source-body is not a valid binding input object.",
            'Use a JSON object whose fields contain {from:"state",key:"@scope:key"} or {from:"literal",value}.',
        );
    }
    return findings;
}

function dynamic(value: string): boolean {
    return value.includes(DYNAMIC_VALUE) || value.includes("{{") || value.includes("#{");
}

function validBody(value: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    if (!record(parsed) || Object.keys(parsed).length === 0) {
        return false;
    }
    return Object.entries(parsed).every(([name, entry]) => name.trim() && validInput(entry));
}

function validInput(value: unknown): boolean {
    if (!record(value)) {
        return false;
    }
    if (value.from === "literal") {
        return exactKeys(value, ["from", "value"]) && Object.hasOwn(value, "value");
    }
    if (value.from !== "state" || !exactKeys(value, ["from", "key", "path", "cast", "optional", "fallback"])) {
        return false;
    }
    const path = value.path;
    const optional = value.optional;
    return (
        typeof value.key === "string" &&
        /^@(param|page|session|persistent):[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value.key) &&
        (path === undefined ||
            (Array.isArray(path) &&
                path.length > 0 &&
                path.length <= 24 &&
                path.every((part) =>
                    typeof part === "string"
                        ? part.length > 0 && !["__proto__", "constructor", "prototype"].includes(part)
                        : Number.isSafeInteger(part) && part >= 0 && part <= 10_000,
                ))) &&
        (value.cast === undefined || ["string", "number", "integer", "boolean"].includes(String(value.cast))) &&
        (optional === undefined || typeof optional === "boolean") &&
        !(optional === true && Object.hasOwn(value, "fallback"))
    );
}

function exactKeys(value: Record<string, unknown>, accepted: readonly string[]): boolean {
    return Object.keys(value).every((key) => accepted.includes(key));
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
