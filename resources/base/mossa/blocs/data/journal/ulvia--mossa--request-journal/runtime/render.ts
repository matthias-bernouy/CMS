import { groupLogs } from "./model";
import type { LogEntry } from "./model";
import { groupView } from "./groups";
import { element } from "./presentation";
import type { Copy, DetailLookup } from "./presentation";
import { eventTable } from "./rows";

export function renderJournal(
    root: HTMLElement,
    entries: readonly LogEntry[],
    grouped: boolean,
    copy: Copy,
    lookup: DetailLookup = () => undefined,
): void {
    const results = root.querySelector<HTMLElement>("[data-results]");
    const summary = root.querySelector<HTMLElement>("[data-summary]");
    if (!results || !summary) {
        return;
    }
    const open = new Set(
        [...results.querySelectorAll<HTMLDetailsElement>("details[open]")].map((node) => node.dataset.requestKey),
    );
    const groups = groupLogs(entries);
    const requestCount = new Set(entries.flatMap((entry) => (entry.requestId ? [entry.requestId] : []))).size;
    summary.textContent = `${entries.length} ${copy("events")} · ${requestCount} ${copy("requests-in-batch")}`;
    if (!entries.length) {
        results.replaceChildren(element("p", "empty", copy("empty")));
    } else if (grouped) {
        const label = element("div", "group-header");
        label.append(
            element("span", "", copy("minimum")),
            element("span", "", copy("request")),
            element("span", "", copy("calls")),
            element("span", "duration", copy("http-duration")),
        );
        results.replaceChildren(
            label,
            ...groups.map((group) =>
                groupView(
                    group,
                    lookup,
                    copy,
                    open.has(group.entries[0]?.requestId ? `request:${group.id}` : `entry:${group.id}`),
                ),
            ),
        );
    } else {
        results.replaceChildren(eventTable(entries, entries, lookup, copy));
    }
}
