import type { UiFinding, UiSource } from "../contracts/types";
import { markupFinding } from "./findings";
import type { MarkupTag } from "./types";

const MUTATION_PATTERN =
    /^\s*[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*:[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\s+as\s+[A-Za-z_][A-Za-z0-9_]*\s*$/u;

export function inspectForms(source: UiSource, tag: MarkupTag): UiFinding[] {
    const attrs = tag.attributes;
    const legacy = Array.from(attrs.keys()).find((name) => name.startsWith("cms-source"));
    if (legacy) {
        return [
            finding(source, tag, legacy, {
                rule: "legacy-source-binding",
                severity: "ERROR",
                message: `${legacy} belongs to the removed cms-source grammar.`,
                recommendation: "Declare reads with cms-query and native form commands with cms-mutation.",
            }),
        ];
    }

    const mutation = attrs.get("cms-mutation");
    if (!mutation) {
        return [];
    }
    if (tag.name !== "form") {
        return [
            finding(source, tag, "cms-mutation", {
                rule: "mutation-form-owner",
                severity: "ERROR",
                message: "cms-mutation is reserved for native form submissions.",
                recommendation: "Use cms-query for reads, or move the mutation onto its owning native form.",
            }),
        ];
    }

    const findings: UiFinding[] = [];
    if (!MUTATION_PATTERN.test(mutation.value)) {
        findings.push(
            finding(source, tag, "cms-mutation", {
                rule: "mutation-contract",
                severity: "ERROR",
                message: "cms-mutation must name one logical contract capability and an explicit local alias.",
                recommendation: 'Use the canonical form "contract:capability as result".',
            }),
        );
    }
    const input = attrs.get("cms-mutation-input")?.value;
    if (input?.trim() && !validInputMap(input)) {
        findings.push(
            finding(source, tag, "cms-mutation-input", {
                rule: "mutation-input-contract",
                severity: "ERROR",
                message: "cms-mutation-input is not a valid typed binding input map.",
                recommendation:
                    'Use a JSON object whose fields contain {from:"state",key:"@scope:key"} or {from:"literal",value}.',
            }),
        );
    }
    return findings;
}

function finding(
    source: UiSource,
    tag: MarkupTag,
    attribute: string,
    details: Omit<UiFinding, "file" | "line" | "column" | "evidence">,
): UiFinding {
    return markupFinding(source, tag.attributes.get(attribute)?.offset ?? tag.offset, details);
}

function validInputMap(value: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    return record(parsed) && Object.keys(parsed).length > 0 && Object.entries(parsed).every(validInputEntry);
}

function validInputEntry([name, value]: [string, unknown]): boolean {
    if (!name.trim() || !record(value)) {
        return false;
    }
    if (value.from === "literal") {
        return exactKeys(value, ["from", "value"]) && Object.hasOwn(value, "value");
    }
    if (value.from !== "state" || !exactKeys(value, ["from", "key", "path", "cast", "optional", "fallback"])) {
        return false;
    }
    const optional = value.optional;
    return (
        typeof value.key === "string" &&
        /^@(param|page|session|persistent):[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value.key) &&
        (value.path === undefined || validPath(value.path)) &&
        (value.cast === undefined || ["string", "number", "integer", "boolean"].includes(String(value.cast))) &&
        (optional === undefined || typeof optional === "boolean") &&
        !(optional === true && Object.hasOwn(value, "fallback"))
    );
}

function validPath(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= 24 &&
        value.every((part) =>
            typeof part === "string"
                ? part.length > 0 && !["__proto__", "constructor", "prototype"].includes(part)
                : Number.isSafeInteger(part) && Number(part) >= 0 && Number(part) <= 10_000,
        )
    );
}

function exactKeys(value: Record<string, unknown>, accepted: readonly string[]): boolean {
    return Object.keys(value).every((key) => accepted.includes(key));
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
