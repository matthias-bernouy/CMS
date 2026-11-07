import type { LogEntry } from "./model";

export type CallStep = { entry: LogEntry; executionMs?: number; errorId?: string };
const severity = ["trace", "debug", "info", "warn", "error", "fatal"];
const gatewayCall = (entry: LogEntry) => entry.event === "gateway.invocation.completed";
const providerCall = (entry: LogEntry) => /^provider\.capability\.(completed|failed)$/.test(entry.event);
const sameCall = (left: LogEntry, right: LogEntry) =>
    Boolean(
        left.invocationId &&
            left.invocationId === right.invocationId &&
            left.capabilityId &&
            left.capabilityId === right.capabilityId,
    );

export function callSteps(entries: readonly LogEntry[], includeHttp = false): CallStep[] {
    const merged = new Set<string>();
    const pairs = new Map<string, LogEntry>();
    for (const gateway of entries.filter(gatewayCall)) {
        const providers = entries.filter((entry) => providerCall(entry) && sameCall(gateway, entry));
        const gateways = entries.filter((entry) => gatewayCall(entry) && sameCall(gateway, entry));
        if (providers.length === 1 && gateways.length === 1) {
            pairs.set(gateway.id, providers[0]!);
            merged.add(providers[0]!.id);
        }
    }
    return entries
        .filter((entry) => !merged.has(entry.id) && (includeHttp || entry.event !== "http.request.completed"))
        .map((entry) => {
            const execution = pairs.get(entry.id);
            const level =
                execution && severity.indexOf(execution.level) > severity.indexOf(entry.level)
                    ? execution.level
                    : entry.level;
            const error =
                execution && ["error", "fatal"].includes(execution.level)
                    ? execution
                    : ["error", "fatal"].includes(entry.level)
                      ? entry
                      : undefined;
            return { entry: { ...entry, level }, executionMs: execution?.durationMs, errorId: error?.id };
        });
}
