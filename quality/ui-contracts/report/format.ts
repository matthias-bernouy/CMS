import type { UiAudit, UiFinding } from "../contracts/types";

export function summary(audit: UiAudit): string {
    const count = (severity: UiFinding["severity"]) =>
        audit.findings.filter((finding) => finding.severity === severity).length;
    const affected = new Set(
        audit.findings.filter((finding) => finding.severity !== "INFO").map((finding) => finding.file),
    ).size;
    return `${count("ERROR")} errors, ${count("WARNING")} warnings, ${count("INFO")} information; ${affected} files with findings; ${audit.scanned.files} files scanned (${audit.scanned.browserScripts} browser scripts).`;
}

export function formatText(audit: UiAudit): string {
    const lines = audit.findings.map(
        (finding) =>
            `[ui-contracts][${finding.severity}][${finding.rule}] ${finding.file}:${finding.line}:${finding.column}\n  ${finding.message}\n  ${finding.recommendation}`,
    );
    return [...lines, `[ui-contracts][SUMMARY] ${summary(audit)}`].join("\n");
}

export function formatMarkdown(audit: UiAudit): string {
    const lines = [
        "# UI Contract Findings",
        "",
        summary(audit),
        "",
        "This is a static inventory. Warnings require review; they do not prove a request is unnecessary.",
        "",
    ];
    for (const finding of audit.findings) {
        lines.push(
            `- **${finding.severity} · ${finding.rule}** — \`${finding.file}:${finding.line}:${finding.column}\``,
            `  ${finding.message}`,
            `  ${finding.recommendation}`,
            "",
        );
    }
    return lines.join("\n");
}
