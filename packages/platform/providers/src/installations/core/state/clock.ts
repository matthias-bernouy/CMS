import { parseDateTime } from "ulvia-providers/manifests/core/parsing/identifiers";
import { ProviderInstallationWorkflowError } from "./errors";

export function timestamp(value: string): number {
    const result = Date.parse(parseDateTime(value, "$.timestamp"));
    if (!Number.isFinite(result)) {
        throw new ProviderInstallationWorkflowError("stale_timestamp", "The CMS clock must produce a valid timestamp");
    }
    return result;
}

export function assertMaxAge(maxAgeMs: number): void {
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
        throw new TypeError("Maximum observation/preparation age must be a positive safe integer");
    }
}
