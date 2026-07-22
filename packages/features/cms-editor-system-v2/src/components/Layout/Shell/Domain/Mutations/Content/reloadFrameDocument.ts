import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import type { MutationContext } from "../shellMutations";

export function reloadFrameDocument(context: MutationContext, selectedTarget: HTMLElement | null = null): void {
    const frameDocument = context.frameDocument();
    if (!frameDocument) {
        return;
    }

    const root =
        frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]") ??
        frameDocument.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
    const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");
    if (!root || !contentRoot) {
        return;
    }

    context.loadDocument({ root, contentRoot }, selectedTarget);
    context.syncViewFrameContent();
}
