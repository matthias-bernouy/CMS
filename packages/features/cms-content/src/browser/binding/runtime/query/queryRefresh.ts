import { parseQueryListen, parseQueryRefresh } from "cms-content/blocs/core/markup/bindings";
import { QUERY_LISTEN_ATTR, QUERY_REFRESH_ATTR } from "../../core/attrs";
import { readSyncValue, subscribeSyncValue } from "../../state/SyncState";
import { selectSyncValue, shareProjectedValue } from "../../state/selectSyncValue";

export function listenQueryRefresh(element: Element, refresh: (acknowledge?: HTMLFormElement) => void): () => void {
    const doc = element.ownerDocument;
    const win = doc.defaultView;
    const policy = parseQueryRefresh(element.getAttribute(QUERY_REFRESH_ATTR));
    const stops: Array<() => void> = [];
    const listen = (target: EventTarget | null | undefined, event: string, listener: EventListener) => {
        target?.addEventListener(event, listener);
        stops.push(() => target?.removeEventListener(event, listener));
    };
    const onRefresh = () => refresh();

    for (const listener of parseQueryListen(element.getAttribute(QUERY_LISTEN_ATTR)) ?? []) {
        let selected = selectSyncValue(readSyncValue(listener.sync, doc), listener.path);
        stops.push(
            subscribeSyncValue(
                listener.sync,
                (value, change) => {
                    const next = shareProjectedValue(selected, selectSyncValue(value, listener.path));
                    if (Object.is(selected, next)) {
                        return;
                    }
                    selected = next;
                    refresh(ownerForm(change.source, doc));
                },
                doc,
            ),
        );
    }
    if (policy?.focus) {
        listen(doc, "visibilitychange", () => {
            if (doc.visibilityState !== "hidden") {
                refresh();
            }
        });
    }
    if (policy?.reconnect) {
        listen(win, "online", onRefresh);
    }
    const timer = policy?.intervalMs ? win?.setInterval(refresh, policy.intervalMs) : undefined;

    return () => {
        stops.forEach((stop) => stop());
        if (timer !== undefined) {
            win?.clearInterval(timer);
        }
    };
}

function ownerForm(source: Element | undefined, doc: Document): HTMLFormElement | undefined {
    const Form = doc.defaultView?.HTMLFormElement;
    return Form && source instanceof Form ? source : undefined;
}
