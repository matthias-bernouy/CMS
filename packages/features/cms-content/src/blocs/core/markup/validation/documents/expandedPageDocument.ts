import { validateContentTextPlacements } from "cms-content/pages/core/rendering/contentTextTraversal";
import { parseHTML } from "linkedom";
import { expandCompositions, type CompositionDefinition } from "cms-content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "cms-content/blocs/core/markup/bindings/operation/stateGraph";
import { validateExpandedPageOutline } from "cms-content/blocs/core/markup/validation/documents/pageOutline";

/** Validates rules that only become decidable after the complete Page composition has expanded. */
export function validateExpandedPageDocument(html: string, definitions: readonly CompositionDefinition[]): void {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = html;
    expandCompositions(document.body, definitions);
    validateContentTextPlacements(document.body);
    validateExpandedPageOutline(document.body);
    validateStateQueryGraph(document.body);
}
