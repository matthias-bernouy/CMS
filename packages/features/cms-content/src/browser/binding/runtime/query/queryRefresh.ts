import { parseQueryListen, parseQueryRefresh } from "cms-content/blocs/core/markup/bindings";
import { QUERY_LISTEN_ATTR, QUERY_REFRESH_ATTR } from "../../core/attrs";
import { subscribeSyncValue } from "../../params/SyncState";

export function listenQueryRefresh(element: Element, refresh: () => void): () => void {
    const doc = element.ownerDocument;
    const win = doc.defaultView;
    const policy = parseQueryRefresh(element.getAttribute(QUERY_REFRESH_ATTR));
    const stops: Array<() => void> = [];
    const listen = (target: EventTarget | null | undefined, event: string, listener: EventListener) => {
        target?.addEventListener(event, listener);
        stops.push(() => target?.removeEventListener(event, listener));
    };
    const onRefresh = () => refresh();

    for (const target of parseQueryListen(element.getAttribute(QUERY_LISTEN_ATTR)) ?? []) {
        stops.push(subscribeSyncValue(target, refresh, doc));
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
