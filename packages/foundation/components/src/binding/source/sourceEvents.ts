import { SOURCE_ATTR, SOURCE_TRIGGER_ATTR, isSourceTrigger } from "../attrs";
import { listenReactiveUrlChanges } from "./reactiveUrl";
import { sourceUrl } from "./sourceSpec";

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Always-listened global event; dispatching it reloads every live source. */
export const RELOAD_EVENT = "cms-source:reload";

export type SourceEventCallbacks = {
    onReload: () => void;
    onReactiveUrlChange: () => void;
    onSubmit: (event: SubmitEvent) => void;
};

export function sourceTrigger(source: Element): "auto" | "submit" {
    const value = source.getAttribute(SOURCE_TRIGGER_ATTR);
    return isSourceTrigger(value) ? value : "auto";
}

export function listenSourceEvents(source: Element, callbacks: SourceEventCallbacks): () => void {
    const doc = source.ownerDocument;
    const reloadEvents = [RELOAD_EVENT, ...namedReloadEvents(source)];
    for (const eventName of reloadEvents) doc.addEventListener(eventName, callbacks.onReload);

    if (sourceTrigger(source) === "submit") {
        const form = asOwnerForm(source) ?? source.closest("form");
        form?.addEventListener("submit", callbacks.onSubmit);
        return () => {
            for (const eventName of reloadEvents) doc.removeEventListener(eventName, callbacks.onReload);
            form?.removeEventListener("submit", callbacks.onSubmit);
        };
    }

    const stopUrlListeners = listenReactiveUrlChanges(
        sourceUrl(source.getAttribute(SOURCE_ATTR) ?? ""),
        doc,
        callbacks.onReactiveUrlChange,
    );
    return () => {
        for (const eventName of reloadEvents) doc.removeEventListener(eventName, callbacks.onReload);
        stopUrlListeners();
    };
}

function asOwnerForm(source: Element): HTMLFormElement | null {
    const ctor = source.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && source instanceof ctor ? source as HTMLFormElement : null;
}

function namedReloadEvents(source: Element): string[] {
    return (source.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
}
