import { formatDuration } from "./model";
import type { LogGroup } from "./model";
import { badge, element, httpLabel, operation } from "./presentation";
import type { Copy, DetailLookup } from "./presentation";
import { eventTable } from "./rows";
import { callSteps } from "./calls";

export function groupView(group: LogGroup, lookup: DetailLookup, copy: Copy, expanded: boolean): HTMLDetailsElement {
    const details = element("details", "request");
    details.dataset.requestKey = group.entries[0]?.requestId ? `request:${group.id}` : `entry:${group.id}`;
    details.open = expanded;
    const summary = element("summary", "request-row");
    const identity = element("span", "identity");
    const http = group.entries
        .filter((entry) => entry.event === "http.request.completed")
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];
    const title = element(
        "strong",
        "request-title",
        http ? httpLabel(lookup(http.id)?.data) || copy("http-request") : operation(group.entries[0]!, group.entries),
    );
    if (http) {
        details.dataset.httpId = http.id;
        title.dataset.httpLabel = http.id;
    }
    identity.append(title, element("span", "request-id", group.id));
    const status = element("span", "http-status");
    if (http) {
        status.dataset.httpStatus = http.id;
        const value = lookup(http.id)?.data?.attributes.status;
        status.textContent = value && /^\d{3}$/.test(value) ? `HTTP ${value}` : "";
    }
    identity.append(status);
    const count = element("span", "count");
    count.append(
        element("span", "count-number", String(callSteps(group.entries).length)),
        element("span", "count-label", copy("calls")),
    );
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
    steps.append(element("p", "steps-label", copy("calls-note")));
    const ordered = [...group.entries].sort((left, right) => left.time.localeCompare(right.time));
    steps.append(eventTable(ordered, group.entries, lookup, copy, false));
    details.append(summary, steps);
    return details;
}
