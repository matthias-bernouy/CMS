import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";
import type { ExpandedContext } from "./context";

export function expandedStructureDiagnostics(context: ExpandedContext): ContentDiagnostic[] {
    const diagnostics: ContentDiagnostic[] = [];
    const mains: Element[] = [];
    for (const element of context.elements) {
        if (diagnostics.length >= 32) {
            break;
        }
        const state = context.presence.get(element)!;
        if (element.localName === "main" && !state.hidden) {
            if (mains.length >= 256) {
                diagnostics.push(
                    issue(
                        context,
                        element,
                        "page.analysis_budget",
                        "Main landmark analysis exceeded its branch budget.",
                        "Reduce the number of alternative main landmarks.",
                    ),
                );
                break;
            }
            if (state.repeated) {
                diagnostics.push(
                    issue(
                        context,
                        element,
                        "page.repeated_main",
                        "A main landmark cannot be inside an unbounded repetition.",
                        "Repeat content inside one main landmark.",
                    ),
                );
            }
            const parent = element.parentElement?.closest("main");
            if (parent && context.coexist(parent, element)) {
                diagnostics.push(
                    issue(
                        context,
                        element,
                        "page.main_nested",
                        "A main landmark is nested inside another main landmark.",
                        "Use a section, article or div for the inner structure.",
                    ),
                );
            } else if (mains.some((other) => context.coexist(other, element))) {
                diagnostics.push(
                    issue(
                        context,
                        element,
                        "page.multiple_main",
                        "The expanded Page contains several simultaneously active main landmarks.",
                        "Keep one main landmark for the Page.",
                    ),
                );
            }
            if (element.parentElement?.closest("header, footer, nav, aside, article")) {
                diagnostics.push(
                    issue(
                        context,
                        element,
                        "page.main_ancestor",
                        "A main landmark is inside a header, footer, nav, aside or article.",
                        "Place the main landmark outside that structure.",
                    ),
                );
            }
            mains.push(element);
        }
        const interactive = element.matches(
            'a[href], button, input:not([type="hidden"]), select, textarea, details, iframe, audio[controls], video[controls]',
        );
        const enclosing = element.parentElement?.closest("a[href], button");
        if (interactive && enclosing && context.coexist(enclosing, element)) {
            diagnostics.push(
                issue(
                    context,
                    element,
                    "page.interactive_nested",
                    "Interactive elements are nested inside a link or button after expansion.",
                    "Move the inner control outside the enclosing interactive element.",
                ),
            );
        }
        if (element.localName === "form" && element.parentElement?.closest("form")) {
            diagnostics.push(
                issue(
                    context,
                    element,
                    "page.form_nested",
                    "Forms are nested after expansion.",
                    "Use separate forms or a non-form container.",
                ),
            );
        }
    }
    return diagnostics;
}

function issue(
    context: ExpandedContext,
    element: Element,
    code: string,
    message: string,
    suggestion: string,
): ContentDiagnostic {
    return { code, severity: "error", message, location: context.location(element), suggestion };
}
