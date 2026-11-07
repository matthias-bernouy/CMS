import type { LogEntry, LogDetail } from "./model";
export type Copy = (key: string) => string;
export type DetailState = { status: "loading" | "success" | "error"; data?: LogDetail };
export type DetailLookup = (id: string) => DetailState | undefined;

export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    part: string,
    text = "",
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.setAttribute("part", part);
    node.textContent = text;
    return node;
}
export function badge(level: string): HTMLElement {
    const node = element("span", "level", level.toUpperCase());
    node.dataset.level = level;
    return node;
}
export function known(value: string | undefined): string {
    return value && value !== "undefined" && value !== "null" ? value : "";
}
export function httpLabel(detail: LogDetail | undefined): string {
    if (!detail || detail.event !== "http.request.completed") {
        return "";
    }
    const { method, path } = detail.attributes;
    return method && path ? `${method} ${path}` : "";
}
export function operation(entry: LogEntry, batch: readonly LogEntry[]): string {
    const capability = known(entry.capabilityId);
    let contract = known(entry.contractId);
    if (!contract && entry.invocationId && capability) {
        const matches = new Set(
            batch
                .filter((item) => item.invocationId === entry.invocationId && item.capabilityId === capability)
                .map((item) => known(item.contractId))
                .filter(Boolean),
        );
        if (matches.size === 1) {
            contract = [...matches][0] ?? "";
        }
    }
    return capability ? `${contract ? `${contract} · ` : ""}${capability}` : entry.event;
}
export function nestingDepth(entry: LogEntry, batch: readonly LogEntry[]): number {
    let parent = entry.parentInvocationId;
    const visited = new Set([entry.invocationId]);
    let depth = 0;
    while (parent && depth < 4 && !visited.has(parent)) {
        visited.add(parent);
        depth++;
        parent = batch.find((item) => item.invocationId === parent)?.parentInvocationId;
    }
    return depth;
}
