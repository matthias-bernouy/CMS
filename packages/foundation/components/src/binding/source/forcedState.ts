import { type SourceState } from "../attrs";
import { type FilterMap } from "../interpolate";
import { renderContent, type Captured } from "../render/slots";

export function renderForcedSourceState(
    el: Element,
    captured: Captured,
    filters: FilterMap,
    state: Exclude<SourceState, "loaded">,
): void {
    const fragment = captured.slots[state];
    if (!fragment) {
        el.replaceChildren();
        return;
    }

    const scope = state === "error"
        ? { value: { status: 0, message: "Forced error state" } }
        : null;
    renderContent(el, fragment, scope, filters);
}
