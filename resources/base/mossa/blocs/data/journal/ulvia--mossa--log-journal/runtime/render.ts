import { formatDuration, groupLogs } from "./model";
import type { LogEntry, LogGroup } from "./model";

export type Copy = (key: string) => string;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.setAttribute("part", part);
    node.textContent = text;
    return node;
}

function badge(level: string): HTMLElement {
    const node = element("span", "level", level.toUpperCase());
    node.dataset.level = level;
    return node;
}

function entryRow(entry: LogEntry, detailPath: string, copy: Copy): HTMLElement {
    const row = element("tr", "entry-row");
    const date = new Date(entry.time);
    const time = element("time", "time", Number.isFinite(date.getTime()) ? date.toISOString().slice(11, 19) : "—");
    time.dateTime = entry.time;
    time.title = entry.time;
    const timeCell = element("td", "time-cell");
    timeCell.append(time);
    const level = element("td", "level-cell");
    level.append(badge(entry.level));
    const event = element("td", "event-cell");
    const title = detailPath ? element("a", "event", entry.event) : element("span", "event", entry.event);
    if (title instanceof HTMLAnchorElement) {
        title.href = `${detailPath}?ulvia--mossa--log-id=${encodeURIComponent(entry.id)}`;
        title.setAttribute("aria-label", `${copy("detail")}: ${entry.event}`);
    }
    event.append(title, element("span", "meta", `${entry.service}${entry.requestId ? ` · ${entry.requestId}` : ""}`));
    const duration = element("td", "duration", formatDuration(entry.durationMs, document.documentElement.lang || "en"));
    row.append(timeCell, level, event, duration);
    return row;
}

function eventTable(entries: readonly LogEntry[], detailPath: string, copy: Copy): HTMLElement {
    const table = element("table", "table");
    const caption = element("caption", "sr-only", copy("events"));
    const head = element("thead", "table-head");
    const header = element("tr", "header-row");
    for (const key of ["time", "minimum", "event", "duration"]) {
        const cell = element("th", "column", copy(key));
        cell.scope = "col";
        header.append(cell);
    }
    head.append(header);
    const body = element("tbody", "table-body");
    for (const entry of entries) {
        body.append(entryRow(entry, detailPath, copy));
    }
    table.append(caption, head, body);
    return table;
}

function groupView(group: LogGroup, detailPath: string, copy: Copy, expanded: boolean): HTMLDetailsElement {
    const details = element("details", "request");
    details.dataset.requestKey = group.entries[0]?.requestId ? `request:${group.id}` : `entry:${group.id}`;
    details.open = expanded;
    const summary = element("summary", "request-row");
    const identity = element("span", "identity");
    identity.append(element("strong", "request-id", group.id));
    const services = [...new Set(group.entries.map((entry) => entry.service))].join(" · ");
    identity.append(element("span", "meta", services));
    const count = element("span", "count", `${group.entries.length} ${copy("events")}`);
    const duration = element(
        "span",
        "duration",
        formatDuration(group.durationMs, document.documentElement.lang || "en"),
    );
    duration.setAttribute("aria-label", `${copy("http-duration")}: ${duration.textContent}`);
    const indicator = element("span", "indicator", "›");
    indicator.setAttribute("aria-hidden", "true");
    summary.append(badge(group.level), identity, count, duration, indicator);
    const steps = element("div", "steps");
    steps.append(element("p", "steps-label", copy("steps")));
    const ordered = [...group.entries].sort((left, right) => left.time.localeCompare(right.time));
    steps.append(eventTable(ordered, detailPath, copy));
    details.append(summary, steps);
    return details;
}

export function renderJournal(root: HTMLElement, entries: readonly LogEntry[], grouped: boolean, copy: Copy): void {
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
    const configuredPath = root.getAttribute("detail-path") ?? "";
    const path = /^\/(?!\/)[^?#\\\x00-\x20]*$/.test(configuredPath) ? configuredPath : "";
    if (!entries.length) {
        results.replaceChildren(element("p", "empty", copy("empty")));
    } else if (grouped) {
        const label = element("div", "group-header");
        label.append(
            element("span", "", copy("minimum")),
            element("span", "", copy("request")),
            element("span", "", copy("events")),
            element("span", "duration", copy("http-duration")),
        );
        results.replaceChildren(
            label,
            ...groups.map((group) =>
                groupView(
                    group,
                    path,
                    copy,
                    open.has(group.entries[0]?.requestId ? `request:${group.id}` : `entry:${group.id}`),
                ),
            ),
        );
    } else {
        results.replaceChildren(eventTable(entries, path, copy));
    }
}
