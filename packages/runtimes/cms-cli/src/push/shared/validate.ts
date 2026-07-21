import { extractRefs } from "@bernouy/cms-content";

export { extractRefs };

export type ValidationKind = "bloc";

export type ValidationIssue = {
    /** Human-readable origin of the offending content (page path, template identifier, ...). */
    source: string;
    kind: ValidationKind;
    name: string;
};

export type ValidationReport = {
    /** Reference is unknown both remotely and locally — content would break at render. */
    errors: ValidationIssue[];
    /** Reference exists locally but isn't pushed yet — fine if you push it later. */
    warnings: ValidationIssue[];
};

export type ValidatableDoc = { source: string; content: string };

export function validateDocs(
    docs: ValidatableDoc[],
    remoteBlocs: Set<string>,
    localBlocs: Set<string>,
): ValidationReport {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    for (const doc of docs) {
        const { blocs } = extractRefs(doc.content);
        for (const tag of blocs) {
            classify(tag, "bloc", doc.source, remoteBlocs, localBlocs, errors, warnings);
        }
    }
    return { errors, warnings };
}

function classify(
    name: string,
    kind: ValidationKind,
    source: string,
    remote: Set<string>,
    local: Set<string>,
    errors: ValidationIssue[],
    warnings: ValidationIssue[],
): void {
    if (remote.has(name)) {
        return;
    }
    (local.has(name) ? warnings : errors).push({ source, kind, name });
}

const HINT: Record<ValidationKind, string> = {
    bloc: "missing on remote — push it via `p9r push --type=blocs` first",
};

/**
 * Print the report and tell the caller whether to proceed. Warnings are
 * informational; errors abort unless the caller passed `force=true`.
 */
export function printValidation(report: ValidationReport, force: boolean): boolean {
    for (const w of report.warnings) {
        console.warn(`⚠ ${w.source} references ${w.kind} "${w.name}" — present locally but not yet on remote.`);
    }
    if (report.errors.length === 0) {
        return true;
    }
    for (const e of report.errors) {
        console.error(`✖ ${e.source} references ${e.kind} "${e.name}" — ${HINT[e.kind]}.`);
    }
    if (force) {
        console.warn(`⚠ Continuing despite ${report.errors.length} validation error(s) (--force).`);
        return true;
    }
    console.error(`\n✖ ${report.errors.length} validation error(s). Re-run with --force to bypass.`);
    return false;
}
