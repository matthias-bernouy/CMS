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
    const trigger = attrs.get("cms-source-trigger")?.value ?? "auto";
    const automatic = !["submit", "change"].includes(trigger) && !dynamic(trigger);
    const method = attrs.get("cms-source-method")?.value.trim().toUpperCase();
    if (automatic && knownMutatingGet(source, sourceAttr.value)) {
        report(
            "cms-source",
            "source-automatic-mutation",
            "ERROR",
            "This automatic source requests the Control logout endpoint, which clears the authentication cookie on GET.",
            "Use an explicit logout action or link; do not load this endpoint as page data.",
        );
    }
    if (automatic && method && !dynamic(method) && method !== "GET") {
        report(
            "cms-source-method",
            "source-automatic-method",
            "WARNING",
            `Automatic sources perform GET; the declared ${method} method is ignored.`,
            'For a submission, place cms-source on a native form and set cms-source-trigger="submit" or "change".',
        );
    }
    const formSubmission = tag.name === "form" && ["submit", "change"].includes(trigger);
    if (
        tag.name !== "form" &&
        ["submit", "change"].includes(trigger) &&
        method &&
        !dynamic(method) &&
        method !== "GET"
    ) {
        report(
            "cms-source-trigger",
            "source-trigger-target",
            "WARNING",
            `Only a native form submits with ${method}; this element performs GET when its ancestor form triggers ${trigger}.`,
            "Move the source and submission attributes onto the native form, or use GET for an event-triggered data refresh.",
        );
    }
    if (!formSubmission) {
        return findings;
    }
    const published = attrs.get("cms-source-publish")?.value ?? "";
    const reload = attrs.get("cms-reload-on")?.value ?? "";
    if (!dynamic(reload)) {
        // Success events bubble to the same document that owns explicit reload listeners.
        const emitted = new Set([
            ...(dynamic(published) ? [] : published.split(/\s+/)),
            "cms-source:success",
            "form:success",
        ]);
        const loops = reload.split(/\s+/).filter((event) => event && emitted.has(event));
        if (loops.length) {
            report(
                "cms-reload-on",
                "source-publish-reload-loop",
                "ERROR",
                `A successful submission emits its own reload event: ${[...new Set(loops)].join(", ")}.`,
                "Publish events for other data sources, but remove them from this form's cms-reload-on.",
            );
        }
    }
    const body = attrs.get("cms-source-body")?.value;
    if (body?.trim() && !dynamic(body) && !["GET", "HEAD"].includes(method ?? "POST") && !validBody(body)) {
        report(
            "cms-source-body",
            "source-body-contract",
            "WARNING",
            "The literal cms-source-body contains entries the runtime ignores.",
            'Use a JSON object whose fields contain {from:"queryParam",name}, {from:"state",name}, or {from:"raw",value}; raw values must be nonempty strings, finite numbers, or booleans.',
        );
    }
    return findings;
}

function dynamic(value: string): boolean {
    return value.includes(DYNAMIC_VALUE) || value.includes("{{") || value.includes("#{");
}

function knownMutatingGet(source: UiSource, value: string): boolean {
    if (!source.path.replaceAll("\\", "/").startsWith("packages/surfaces/cms-control/")) {
        return false;
    }
    // mountRoutes/index.ts mounts GET <basePath>/logout; LocalAuthentication.logout clears its cookie.
    const url = value.replace(/\s+as\s+[A-Za-z_$][\w$]*\s*$/, "").trim();
    return /^(?:\{\{\s*BASE_PATH\s*\}\})?\/logout(?:[?#]|$)/.test(url);
}

function validBody(value: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    if (!record(parsed)) {
        return false;
    }
    return Object.entries(parsed).every(([name, entry]) => {
        if (!name.trim() || !record(entry)) {
            return false;
        }
        if (entry.from === "queryParam" || entry.from === "state") {
            return typeof entry.name === "string" && Boolean(entry.name.trim());
        }
        return (
            entry.from === "raw" &&
            (typeof entry.value === "boolean" ||
                (typeof entry.value === "number" && Number.isFinite(entry.value)) ||
                (typeof entry.value === "string" && Boolean(entry.value.trim())))
        );
    });
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
