export interface UiSource {
    /** Repository-relative POSIX path. */
    path: string;
    content: string;
    kind: "html" | "script";
    /** Reachable from a declared browser surface, or an authored browser entrypoint. */
    browser: boolean;
}

export interface UiFinding {
    rule: string;
    severity: "ERROR" | "WARNING" | "INFO";
    file: string;
    line: number;
    column: number;
    message: string;
    evidence: string;
    recommendation: string;
}

export interface UiAudit {
    schemaVersion: 1;
    scanned: { files: number; html: number; scripts: number; browserScripts: number };
    findings: UiFinding[];
}
