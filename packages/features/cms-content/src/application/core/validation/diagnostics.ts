import type { ContentDiagnostic } from "cms-content/application/interfaces/diagnostics";
import { ContentValidationError } from "./errors";

const MAX_CONTENT_DIAGNOSTICS = 16;

/** Keep errors ahead of advisories, including when the public report is truncated. */
export function boundedDiagnostics(values: readonly ContentDiagnostic[]): readonly ContentDiagnostic[] {
    const ordered = values
        .filter((value) => value.severity === "error")
        .concat(values.filter((value) => value.severity === "warning"));
    if (ordered.length <= MAX_CONTENT_DIAGNOSTICS) {
        return ordered;
    }
    return [
        ...ordered.slice(0, MAX_CONTENT_DIAGNOSTICS - 1),
        {
            code: "analysis.truncated",
            severity: "warning",
            message: "Additional diagnostics were omitted. Correct the reported issues and check again.",
        },
    ];
}

export function assertContentDiagnostics(values: readonly ContentDiagnostic[]): void {
    const error = values.find((value) => value.severity === "error");
    if (error) {
        throw new ContentValidationError("content", error.message, { code: error.code }, boundedDiagnostics(values));
    }
}
