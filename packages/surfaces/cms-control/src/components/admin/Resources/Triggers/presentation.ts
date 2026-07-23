import type { TriggerListItem } from "./api";

export function eventLabel(trigger: TriggerListItem): string {
    const event = trigger.event;
    return event.kind === "schedule"
        ? `Every ${formatDuration(event.intervalMs)}`
        : `${event.phase} ${event.source ?? "*"}.${event.endpoint ?? "*"}`;
}

export function cell(content: Node | string): HTMLTableCellElement {
    const td = document.createElement("td");
    if (typeof content === "string") {
        td.textContent = content;
    } else {
        td.append(content);
    }
    return td;
}

export function textBlock(primary: string, secondary: string): HTMLElement {
    const wrap = document.createElement("div");
    const top = document.createElement("div");
    const bottom = document.createElement("div");
    top.className = "primary";
    bottom.className = "muted";
    top.textContent = primary;
    bottom.textContent = secondary;
    wrap.append(top, bottom);
    return wrap;
}

export function lastRun(trigger: TriggerListItem): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `status ${trigger.lastRun?.status ?? ""}`.trim();
    badge.textContent = trigger.lastRun
        ? `${trigger.lastRun.status} · ${formatDate(trigger.lastRun.at)}${trigger.lastRun.durationMs === undefined ? "" : ` · ${formatDuration(trigger.lastRun.durationMs)}`}`
        : "Never";
    if (trigger.lastRun?.error) {
        badge.title = trigger.lastRun.error;
    }
    return badge;
}

export function runtimeState(trigger: TriggerListItem): HTMLElement {
    if (trigger.event.kind !== "schedule") {
        return textBlock(trigger.mode ?? "async", trigger.failureMode ?? "ignore");
    }
    if (!trigger.schedulerAvailable) {
        return textBlock("Scheduler paused", "This runtime used --no-workers");
    }
    if (trigger.scheduleState?.running) {
        return textBlock("Running", `Since ${formatDate(trigger.scheduleState.running.startedAt)}`);
    }
    if (!trigger.enabled) {
        return textBlock("Disabled", "No future runs");
    }
    return textBlock(
        "Scheduled",
        trigger.scheduleState ? `Next ${formatDate(trigger.scheduleState.nextRunAt)}` : "Pending",
    );
}

function formatDuration(value: number): string {
    if (value < 1_000) {
        return `${value} ms`;
    }
    return value % 60_000 === 0 ? `${value / 60_000} min` : `${value / 1_000} s`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
