import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";
import { dynamicValue } from "./context";
import type { ExpandedContext } from "./context";

const REFERENCES = [
    "aria-activedescendant",
    "aria-details",
    "aria-errormessage",
    "aria-controls",
    "aria-describedby",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
    "commandfor",
    "for",
    "form",
    "list",
    "popovertarget",
    "headers",
];

export function expandedReferenceDiagnostics(context: ExpandedContext, complete: boolean): ContentDiagnostic[] {
    const diagnostics: ContentDiagnostic[] = [];
    const warnings: ContentDiagnostic[] = [];
    const warn = (value: ContentDiagnostic) => {
        if (warnings.length < 32) {
            warnings.push(value);
        }
    };
    const hasDynamicIds = context.elements.some((element) => dynamicValue(element.getAttribute("id") ?? ""));
    const ids = new Map<string, Element[]>();
    for (const element of context.elements) {
        const id = element.getAttribute("id");
        if (id && dynamicValue(id) && warnings.length < 32) {
            warn({
                ...problem(
                    context,
                    element,
                    "id",
                    "page.id_dynamic",
                    "The uniqueness of a runtime-generated ID cannot be verified statically.",
                ),
                severity: "warning",
            });
        }
        if (!id || dynamicValue(id)) {
            continue;
        }
        const previous = ids.get(id) ?? [];
        if (previous.length >= 256) {
            diagnostics.push(
                problem(context, element, "id", "page.analysis_budget", "ID branch analysis exceeded its budget."),
            );
            return [...diagnostics, ...warnings];
        }
        if (previous.some((other) => context.coexist(other, element)) && diagnostics.length < 32) {
            diagnostics.push(
                problem(
                    context,
                    element,
                    "id",
                    "page.duplicate_id",
                    `Duplicate static ID ${JSON.stringify(id.slice(0, 160))} after expansion.`,
                ),
            );
        }
        if (context.presence.get(element)!.repeated && diagnostics.length < 32) {
            diagnostics.push(
                problem(
                    context,
                    element,
                    "id",
                    "page.repeated_id",
                    "A static ID inside a repeated template can produce duplicate IDs.",
                ),
            );
        }
        ids.set(id, [...previous, element]);
    }
    if (!complete) {
        return [...diagnostics, ...warnings];
    }
    for (const element of context.elements) {
        for (const attribute of REFERENCES) {
            const value = element.getAttribute(attribute);
            if (value !== null && dynamicValue(value) && warnings.length < 32) {
                warn({
                    ...problem(
                        context,
                        element,
                        attribute,
                        "page.reference_dynamic",
                        "This runtime-generated ID reference was not verified.",
                    ),
                    severity: "warning",
                });
            }
            if (value === null || dynamicValue(value)) {
                continue;
            }
            for (const id of value.trim().split(/\s+/u).filter(Boolean)) {
                if (diagnostics.length >= 32) {
                    return [...diagnostics, ...warnings];
                }
                const targets = (ids.get(id) ?? []).filter((target) => context.coexist(element, target));
                if (!targets.length) {
                    if (hasDynamicIds) {
                        warn({
                            ...problem(
                                context,
                                element,
                                attribute,
                                "page.reference_unverified",
                                "The reference may depend on a runtime-generated target ID and was not verified.",
                            ),
                            severity: "warning",
                        });
                        continue;
                    }
                    diagnostics.push(
                        problem(
                            context,
                            element,
                            attribute,
                            "page.reference_missing",
                            `${attribute} references missing or mutually exclusive ID ${JSON.stringify(id.slice(0, 160))}.`,
                        ),
                    );
                } else if (!targets.some((target) => context.certain(element, target))) {
                    warn({
                        ...problem(
                            context,
                            element,
                            attribute,
                            "page.reference_conditional",
                            `${attribute} depends on a conditional or repeated target.`,
                        ),
                        severity: "warning",
                    });
                } else {
                    const tag =
                        attribute === "form"
                            ? "form"
                            : attribute === "list"
                              ? "datalist"
                              : attribute === "commandfor"
                                ? "dialog"
                                : undefined;
                    if (tag && targets.some((target) => target.localName !== tag)) {
                        diagnostics.push(
                            problem(
                                context,
                                element,
                                attribute,
                                "page.reference_type",
                                `${attribute} must reference a ${tag} element.`,
                            ),
                        );
                    }
                }
            }
        }
    }
    return [...diagnostics, ...warnings];
}

function problem(
    context: ExpandedContext,
    element: Element,
    attribute: string,
    code: string,
    message: string,
): ContentDiagnostic {
    return {
        code,
        severity: "error",
        message,
        location: context.location(element, attribute),
        suggestion: "Correct the target ID and its references in the Page or Bloc template.",
    };
}
