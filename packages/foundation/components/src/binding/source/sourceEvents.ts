import {
    SOURCE_ATTR,
    SOURCE_DELAY_ATTR,
    SOURCE_TRIGGER_ATTR,
    isSourceTrigger,
    type SourceTrigger,
} from "../core/attrs";
import { listenReactiveUrlChanges } from "./runtime/reactiveUrl";
import { sourceUrl } from "./runtime/sourceSpec";

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Refreshes automatic sources; form-triggered sources require an explicit event. */
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
    const trigger = sourceTrigger(source);
    const reloadEvents = new Set([...(trigger === "auto" ? [RELOAD_EVENT] : []), ...namedReloadEvents(source)]);
    const onReload = (event: Event) => {
        if (event.type !== RELOAD_EVENT || event.target === doc || event.target === source) {
            callbacks.onReload();
        }
    };
    for (const eventName of reloadEvents) {
        doc.addEventListener(eventName, onReload);
    }

    if (trigger === "submit" || trigger === "change") {
        const form = asOwnerForm(source) ?? source.closest("form");
        const eventName = trigger === "submit" ? "submit" : "change";
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onChange = (event: Event) => {
            const delay = sourceDelay(source);
            if (delay === 0) {
                callbacks.onChange(event);
                return;
            }
            if (timer !== null) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                timer = null;
                callbacks.onChange(event);
            }, delay);
        };
        const listener = (trigger === "submit" ? callbacks.onSubmit : onChange) as EventListener;
        form?.addEventListener(eventName, listener);
        return () => {
            for (const eventName of reloadEvents) {
                doc.removeEventListener(eventName, onReload);
            }
            form?.removeEventListener(eventName, listener);
            if (timer !== null) {
                clearTimeout(timer);
            }
        };
    }

    const stopUrlListeners = listenReactiveUrlChanges(
        sourceUrl(source.getAttribute(SOURCE_ATTR) ?? ""),
        doc,
        callbacks.onReactiveUrlChange,
    );
    return () => {
        for (const eventName of reloadEvents) {
            doc.removeEventListener(eventName, onReload);
        }
        stopUrlListeners();
    };
}

function sourceDelay(source: Element): number {
    const value = Number(source.getAttribute(SOURCE_DELAY_ATTR));
    return Number.isSafeInteger(value) && value >= 0 && value <= 5000 ? value : 0;
}

function asOwnerForm(source: Element): HTMLFormElement | null {
    const ctor = source.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && source instanceof ctor ? (source as HTMLFormElement) : null;
}

function namedReloadEvents(source: Element): string[] {
    return (source.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
}
