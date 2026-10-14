import { parseQueryRefresh } from "cms-content/blocs/core/markup/bindings/source";
import { QUERY_REFRESH_ATTR } from "../../core/attrs";
import { PARAMS_CHANGE_EVENT, STATE_CHANGE_EVENT } from "../../params";

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

    listen(doc, PARAMS_CHANGE_EVENT, onRefresh);
    listen(doc, STATE_CHANGE_EVENT, onRefresh);
    listen(win, "popstate", onRefresh);
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
