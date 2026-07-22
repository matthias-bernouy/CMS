import { SOURCE_ATTR, SOURCE_TRIGGER_ATTR, isSourceTrigger, type SourceTrigger } from "../core/attrs";
import { listenReactiveUrlChanges } from "./runtime/reactiveUrl";
import { sourceUrl } from "./runtime/sourceSpec";

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Always-listened global event; dispatching it reloads every live source. */
export const RELOAD_EVENT = "cms-source:reload";

export type SourceEventCallbacks = {
    onReload: () => void;
    onReactiveUrlChange: () => void;
    onSubmit: (event: SubmitEvent) => void;
    onChange: (event: Event) => void;
};

export function sourceTrigger(source: Element): SourceTrigger {
    const value = source.getAttribute(SOURCE_TRIGGER_ATTR);
    return isSourceTrigger(value) ? value : "auto";
}

export function listenSourceEvents(source: Element, callbacks: SourceEventCallbacks): () => void {
    const doc = source.ownerDocument;
    const reloadEvents = [RELOAD_EVENT, ...namedReloadEvents(source)];
    for (const eventName of reloadEvents) {
        doc.addEventListener(eventName, callbacks.onReload);
    }

    const trigger = sourceTrigger(source);
    if (trigger === "submit" || trigger === "change") {
        const form = asOwnerForm(source) ?? source.closest("form");
        const eventName = trigger === "submit" ? "submit" : "change";
        const listener = trigger === "submit" ? callbacks.onSubmit : callbacks.onChange;
        form?.addEventListener(eventName, listener as EventListener);
        return () => {
            for (const eventName of reloadEvents) {
                doc.removeEventListener(eventName, callbacks.onReload);
            }
            form?.removeEventListener(eventName, listener as EventListener);
        };
    }

    const stopUrlListeners = listenReactiveUrlChanges(
        sourceUrl(source.getAttribute(SOURCE_ATTR) ?? ""),
        doc,
        callbacks.onReactiveUrlChange,
    );
    return () => {
        for (const eventName of reloadEvents) {
            doc.removeEventListener(eventName, callbacks.onReload);
        }
        stopUrlListeners();
    };
}

function asOwnerForm(source: Element): HTMLFormElement | null {
    const ctor = source.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && source instanceof ctor ? (source as HTMLFormElement) : null;
}

function namedReloadEvents(source: Element): string[] {
    return (source.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
}
