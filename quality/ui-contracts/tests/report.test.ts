import { expect, test } from "bun:test";
import { hasErrors } from "../audit";
import { parseArgs } from "../check";
import type { UiAudit, UiFinding } from "../contracts/types";
import { formatMarkdown, formatText, summary } from "../report/format";

const finding: UiFinding = {
    rule: "example",
    severity: "WARNING",
    file: "component.ts",
    line: 12,
    column: 3,
    message: "Review this request.",
    evidence: 'fetch("/api/items")',
    recommendation: "Use binding when it covers this request.",
};
const audit: UiAudit = {
    schemaVersion: 1,
    scanned: { files: 5, html: 2, scripts: 3, browserScripts: 2 },
    findings: [finding],
};

test("warnings remain non-blocking while errors fail, with actionable and deterministic output", () => {
    expect(hasErrors(audit.findings)).toBe(false);
    expect(hasErrors([{ ...finding, severity: "INFO" }])).toBe(false);
    expect(hasErrors([{ ...finding, severity: "ERROR" }])).toBe(true);
    expect(formatText(audit)).toContain("component.ts:12:3");
    expect(formatText(audit)).toContain(finding.recommendation);
    expect(formatMarkdown(audit)).toContain("Warnings require review");
    expect(summary(audit)).toBe(
        "0 errors, 1 warnings, 0 information; 1 files with findings; 5 files scanned (2 browser scripts).",
    );
});

test("CLI accepts a separate audited worktree and machine-readable output, rejecting invalid arguments", () => {
    expect(parseArgs(["--root", "/tmp/other-worktree", "--json"])).toEqual({
        root: "/tmp/other-worktree",
        format: "json",
    });
    expect(parseArgs(["--markdown"]).format).toBe("markdown");
    expect(() => parseArgs(["--root"])).toThrow();
    expect(() => parseArgs(["--root", "--json"])).toThrow();
    expect(() => parseArgs(["--ignore-all"])).toThrow();
});
