import { buildOfficialRepositoryBootstrapPlan } from "@bernouy/cms-official-integrations/publication";
import { importOfficialReviewedSchemaBaseline, type MaintenanceBaselineImportResult } from "./baselineImportClient";
import {
    parseRepositoryBaselineImportConfig,
    REPOSITORY_BASELINE_IMPORT_HELP,
    type RepositoryBaselineImportEnvironment,
} from "./baselineImportConfig";
import { readRepositoryPublicationToken } from "./tokenFile";

export type RepositoryBaselineImportCommandDependencies = Readonly<{
    environment?: RepositoryBaselineImportEnvironment;
    buildPlan?: typeof buildOfficialRepositoryBootstrapPlan;
    readToken?: (path: string) => Promise<string>;
    importBaseline?: typeof importOfficialReviewedSchemaBaseline;
    write?: (line: string) => void;
    writeError?: (line: string) => void;
}>;

export async function runRepositoryBaselineImportCommand(
    args: readonly string[],
    dependencies: RepositoryBaselineImportCommandDependencies = {},
): Promise<number> {
    const write = dependencies.write ?? console.log;
    const writeError = dependencies.writeError ?? console.error;
    let config;
    try {
        config = parseRepositoryBaselineImportConfig(args, dependencies.environment ?? process.env);
    } catch (error) {
        writeError(safeError(error));
        writeError(REPOSITORY_BASELINE_IMPORT_HELP);
        return 1;
    }
    if (config === "help") {
        write(REPOSITORY_BASELINE_IMPORT_HELP);
        return 0;
    }
    let baselines;
    try {
        baselines = (await (dependencies.buildPlan ?? buildOfficialRepositoryBootstrapPlan)()).reviewedSchemaBaselines;
    } catch {
        writeError("Official reviewed schema baseline plan build failed");
        return 1;
    }
    write(`Official reviewed schema baseline import plan: ${baselines.length} baseline(s)`);
    if (config.dryRun) {
        for (const baseline of baselines) {
            write(`PLAN ${baseline.kind}@${baseline.version} ${baseline.connectorKey} ${baseline.packageDigest}`);
        }
        write(summary(baselines.length, 0, 0, 0, 0));
        return 0;
    }
    if (!config.maintenanceUrl || !config.tokenFile) {
        writeError("Repository baseline import configuration is incomplete");
        return 1;
    }
    let token: string;
    try {
        token = await (dependencies.readToken ?? readRepositoryPublicationToken)(config.tokenFile);
    } catch {
        writeError("Repository maintenance token file is invalid");
        return 1;
    }
    const counts = { imported: 0, unchanged: 0, failed: 0, skipped: 0 };
    const importBaseline = dependencies.importBaseline ?? importOfficialReviewedSchemaBaseline;
    for (const [index, baseline] of baselines.entries()) {
        const result = await importBaseline(
            { maintenanceUrl: config.maintenanceUrl, token, timeoutMs: config.timeoutMs },
            baseline,
        );
        if (result.outcome !== "failed") {
            counts[result.outcome] += 1;
            write(`${result.outcome.toUpperCase()} ${baseline.kind}@${baseline.version} ${baseline.connectorKey}`);
            continue;
        }
        counts.failed += 1;
        counts.skipped = baselines.length - index - 1;
        writeError(failureLine(baseline.kind, baseline.version, result));
        break;
    }
    write(summary(baselines.length, counts.imported, counts.unchanged, counts.failed, counts.skipped));
    return counts.failed === 0 ? 0 : 1;
}

function failureLine(
    kind: string,
    version: string,
    failure: Extract<MaintenanceBaselineImportResult, { outcome: "failed" }>,
) {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `FAILED ${kind}@${version} reason=${failure.reason}${status}${code}${retry}`;
}

function summary(planned: number, imported: number, unchanged: number, failed: number, skipped: number): string {
    return `Summary: planned=${planned} imported=${imported} unchanged=${unchanged} failed=${failed} skipped=${skipped}`;
}

function safeError(error: unknown): string {
    return error instanceof Error
        ? error.message.replace(/[\r\n]/gu, " ").slice(0, 240)
        : "Repository baseline import configuration is invalid";
}
