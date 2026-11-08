import { formatDuration } from "./model";
import type { LogEntry } from "./model";
import { badge, element, httpLabel, nestingDepth, operation } from "./presentation";
import type { Copy, DetailLookup } from "./presentation";
import { callSteps } from "./calls";
import type { CallStep } from "./calls";

function entryRow(step: CallStep, batch: readonly LogEntry[], lookup: DetailLookup, copy: Copy): HTMLElement {
    const { entry } = step;
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
    event.dataset.depth = String(nestingDepth(entry, batch));
    const title = element("strong", "event", httpLabel(lookup(entry.id)?.data) || operation(entry, batch));
    if (entry.event === "http.request.completed") {
        title.dataset.httpLabel = entry.id;
    }
    event.append(title);
    if (step.executionMs !== undefined) {
        event.append(
            element(
                "span",
                "meta",
                `${copy("execution-duration")} · ${formatDuration(step.executionMs, document.documentElement.lang || "en")}`,
            ),
        );
    }
    if (step.errorId) {
        const error = element("p", "step-error");
        error.dataset.errorEntry = step.errorId;
        error.setAttribute("role", "status");
        const state = lookup(step.errorId);
        error.textContent = state?.data?.error ? `${state.data.error.name}: ${state.data.error.message}` : "";
        event.append(error);
    }
    const duration = element("td", "duration", formatDuration(entry.durationMs, document.documentElement.lang || "en"));
    row.append(timeCell, level, event, duration);
    return row;
}
export function eventTable(
    entries: readonly LogEntry[],
    batch: readonly LogEntry[],
    lookup: DetailLookup,
    copy: Copy,
    includeHttp = true,
): HTMLElement {
    const steps: CallStep[] = includeHttp ? entries.map((entry) => ({ entry })) : callSteps(entries);
    if (!steps.length) {
        return element("p", "empty", copy("no-calls"));
    }
    const table = element("table", "table");
    const caption = element("caption", "sr-only", copy("calls"));
    const head = element("thead", "table-head");
    const header = element("tr", "header-row");
    for (const key of ["time", "minimum", "operation", "duration"]) {
        const cell = element("th", "column", copy(key));
        cell.scope = "col";
        header.append(cell);
    }
    head.append(header);
    const body = element("tbody", "table-body");
    for (const step of steps) {
        body.append(entryRow(step, batch, lookup, copy));
    }
    table.append(caption, head, body);
    return table;
}
