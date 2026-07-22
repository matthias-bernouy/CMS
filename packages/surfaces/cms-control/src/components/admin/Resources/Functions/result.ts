import type { FunctionExecutionResult } from "./api";
import { valueAt } from "./create/draft";

export function readableResult(result: FunctionExecutionResult): string {
    if (!result.ok) {
        return nestedError(result.body) ?? `Function failed with status ${result.status}`;
    }
    const count = sentCount(result.body);
    if (count !== null) {
        return `${count} email${count === 1 ? "" : "s"} sent.`;
    }
    return result.status === 204 ? "Function completed without response body." : "Function completed.";
}

function nestedError(value: unknown): string | null {
    for (const candidate of [valueAt(value, "details.body.error"), valueAt(value, "error")]) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate;
        }
    }
    return null;
}

function sentCount(value: unknown): number | null {
    const messages = valueAt(value, "messages");
    return Array.isArray(messages) ? messages.length : null;
}
