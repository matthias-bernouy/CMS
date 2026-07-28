import { buildOfficialRepositoryBootstrapPlan } from "@bernouy/cms-official-integrations/publication";
import {
    parseRepositoryVerificationBackfillConfig,
    REPOSITORY_VERIFICATION_BACKFILL_HELP,
    type RepositoryBaselineImportEnvironment,
} from "../baselineImportConfig";
import { readRepositoryPublicationToken } from "../tokenFile";
import { backfillOfficialIntegrationVerification, type MaintenanceVerificationBackfillResult } from "./backfillClient";

export type RepositoryVerificationBackfillCommandDependencies = Readonly<{
    environment?: RepositoryBaselineImportEnvironment;
    buildPlan?: typeof buildOfficialRepositoryBootstrapPlan;
    readToken?: (path: string) => Promise<string>;
    backfill?: typeof backfillOfficialIntegrationVerification;
    write?: (line: string) => void;
    writeError?: (line: string) => void;
}>;

export async function runRepositoryVerificationBackfillCommand(
    args: readonly string[],
    dependencies: RepositoryVerificationBackfillCommandDependencies = {},
): Promise<number> {
    const write = dependencies.write ?? console.log;
    const writeError = dependencies.writeError ?? console.error;
    let config;
    try {
        config = parseRepositoryVerificationBackfillConfig(args, dependencies.environment ?? process.env);
    } catch (error) {
        writeError(safeError(error));
        writeError(REPOSITORY_VERIFICATION_BACKFILL_HELP);
        return 1;
    }
    if (config === "help") {
        write(REPOSITORY_VERIFICATION_BACKFILL_HELP);
        return 0;
    }
    let entries;
    try {
        entries = (await (dependencies.buildPlan ?? buildOfficialRepositoryBootstrapPlan)()).verificationBackfills;
    } catch {
        writeError("Official verification backfill plan build failed");
        return 1;
    }
    write(`Official verification backfill plan: ${entries.length} version(s)`);
    if (config.dryRun) {
        for (const entry of entries) {
            const target = entry.verification.envelope.target;
            write(`PLAN ${target.kind}@${target.version} ${target.packageDigest} ${entry.verification.digest}`);
        }
        write(summary(entries.length, 0, 0, 0, 0));
        return 0;
    }
    if (!config.maintenanceUrl || !config.tokenFile) {
        writeError("Repository verification backfill configuration is incomplete");
        return 1;
    }
    let token: string;
    try {
        token = await (dependencies.readToken ?? readRepositoryPublicationToken)(config.tokenFile);
    } catch {
        writeError("Repository maintenance token file is invalid");
        return 1;
    }
    const counts = { backfilled: 0, unchanged: 0, failed: 0, skipped: 0 };
    const backfill = dependencies.backfill ?? backfillOfficialIntegrationVerification;
    for (const [index, entry] of entries.entries()) {
        const target = entry.verification.envelope.target;
        const outcome = await backfill(
            { maintenanceUrl: config.maintenanceUrl, token, timeoutMs: config.timeoutMs },
            entry,
        );
        if (outcome.outcome !== "failed") {
            counts[outcome.outcome] += 1;
            write(`${outcome.outcome.toUpperCase()} ${target.kind}@${target.version}`);
            continue;
        }
        counts.failed += 1;
        counts.skipped = entries.length - index - 1;
        writeError(failureLine(target.kind, target.version, outcome));
        break;
    }
    write(summary(entries.length, counts.backfilled, counts.unchanged, counts.failed, counts.skipped));
    return counts.failed === 0 ? 0 : 1;
}

function failureLine(
    kind: string,
    version: string,
    failure: Extract<MaintenanceVerificationBackfillResult, { outcome: "failed" }>,
): string {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `FAILED ${kind}@${version} reason=${failure.reason}${status}${code}${retry}`;
}

function summary(planned: number, backfilled: number, unchanged: number, failed: number, skipped: number): string {
    return `Summary: planned=${planned} backfilled=${backfilled} unchanged=${unchanged} failed=${failed} skipped=${skipped}`;
}

function safeError(error: unknown): string {
    return error instanceof Error
        ? error.message.replace(/[\r\n]/gu, " ").slice(0, 240)
        : "Repository verification backfill configuration is invalid";
}
