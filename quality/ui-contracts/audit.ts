import type { UiAudit, UiFinding, UiSource } from "./contracts/types";
import { discoverUiSources } from "./source/files";
import { inspectMarkup } from "./markup/index";
import { inspectNetwork } from "./network/index";

export function inspectSources(sources: readonly UiSource[]): UiAudit {
    const findings = sources.flatMap((source) => [...inspectMarkup(source), ...inspectNetwork(source)]);
    findings.sort(
        (a, b) =>
            a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule),
    );
    return {
        schemaVersion: 1,
        scanned: {
            files: sources.length,
            html: sources.filter((source) => source.kind === "html").length,
            scripts: sources.filter((source) => source.kind === "script").length,
            browserScripts: sources.filter((source) => source.kind === "script" && source.browser).length,
        },
        findings,
    };
}

export async function auditUiContracts(root: string): Promise<UiAudit> {
    const sources = await discoverUiSources(root);
    if (!sources.length) {
        throw new Error("No production sources found under workspace packages.");
    }
    return inspectSources(sources);
}

export function hasErrors(findings: readonly UiFinding[]): boolean {
    return findings.some((finding) => finding.severity === "ERROR");
}
