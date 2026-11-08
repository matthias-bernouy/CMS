import { validateContentTextPlacements } from "content/pages/core/rendering/contentTextTraversal";
import { parseHTML } from "linkedom";
import { expandCompositions, type CompositionDefinition } from "content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "content/blocs/core/markup/bindings/operation/stateGraph";
import { validateExpandedPageOutline } from "./expanded/outline";
import { expandedContext } from "./expanded/context";
import { expandedStructureDiagnostics } from "./expanded/structure";
import { expandedReferenceDiagnostics } from "./expanded/references";
import { boundedDiagnostics } from "content/application/core/validation/diagnostics";
import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";
import { ContentValidationError } from "content/application/core/validation/errors";

/** Validates rules that only become decidable after the complete Page composition has expanded. */
export function validateExpandedPageDocument(html: string, definitions: readonly CompositionDefinition[]): void {
    const root = expandDocument(html, definitions);
    validateContentTextPlacements(root);
    validateExpandedPageOutline(root);
    validateStateQueryGraph(root);
}

/** Authoring analysis is explicit; reading historical releases does not apply new authoring policy. */
export function analyzeExpandedPageDocument(
    html: string,
    definitions: readonly CompositionDefinition[],
    complete = true,
) {
    const origins = new WeakMap<Element, string>();
    const root = expandDocument(html, definitions, origins);
    const context = expandedContext(root, origins);
    const diagnostics: ContentDiagnostic[] = [
        ...expandedStructureDiagnostics(context),
        ...expandedReferenceDiagnostics(context, complete),
    ];
    for (const validate of [validateContentTextPlacements, validateExpandedPageOutline, validateStateQueryGraph]) {
        try {
            validate(root);
        } catch (error) {
            diagnostics.push({
                code: error instanceof ContentValidationError ? error.issue.code : "page.expanded_invalid",
                severity: "error",
                message: (error instanceof Error ? error.message : "Invalid expanded document").slice(0, 2048),
            });
        }
    }
    return { root, context, diagnostics: boundedDiagnostics(diagnostics), definitions };
}

function expandDocument(
    html: string,
    definitions: readonly CompositionDefinition[],
    origins?: WeakMap<Element, string>,
): HTMLElement {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = html;
    expandCompositions(document.body, definitions, "render", origins);
    return document.body;
}
