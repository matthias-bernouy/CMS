import { parseQueryInput, parseQueryRefresh, parseSyncTarget } from "cms-content/blocs/core/markup/bindings";
import { QUERY_INPUT_ATTR, QUERY_REFRESH_ATTR } from "../../core/attrs";
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

    const targets = new Map<string, NonNullable<ReturnType<typeof parseSyncTarget>>>();
    for (const source of Object.values(parseQueryInput(element.getAttribute(QUERY_INPUT_ATTR)) ?? {})) {
        const target = source?.from === "sync" ? parseSyncTarget(source.key) : null;
        if (target) {
            targets.set(`@${target.scope}:${target.key}`, target);
        }
    }
    for (const target of targets.values()) {
        stops.push(subscribeSyncValue(target, onRefresh, doc));
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
