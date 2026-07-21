import type { ArchitectureViolation } from "./architectureTypes";

export function formatArchitectureViolations(violations: readonly ArchitectureViolation[]): string {
    return violations
        .map((violation) => {
            const location = violation.file ? `${violation.file}${violation.line ? `:${violation.line}` : ""}: ` : "";
            return `[${violation.kind}] ${location}${violation.message}`;
        })
        .join("\n");
}

export function finalizeViolations(violations: readonly ArchitectureViolation[]): ArchitectureViolation[] {
    const seen = new Set<string>();
    return violations
        .filter((violation) => {
            const key = `${violation.kind}\0${violation.file ?? ""}\0${violation.line ?? ""}\0${violation.message}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .sort(compareViolations);
}

function compareViolations(a: ArchitectureViolation, b: ArchitectureViolation): number {
    return (
        (a.file ?? "").localeCompare(b.file ?? "") ||
        (a.line ?? 0) - (b.line ?? 0) ||
        a.kind.localeCompare(b.kind) ||
        a.message.localeCompare(b.message)
    );
}
