import { getAccessToken } from "cms-cli/credentials";
import { repositoryManagementUrlForCms } from "../managementUrl";
import { executeRepositoryOperator } from "./client";
import { parseRepositoryOperatorConfig, REPOSITORY_OPERATOR_HELP, type RepositoryOperatorEnvironment } from "./config";
import type { ChannelPreview, RepositoryOperatorResult } from "./contracts";

export type RepositoryOperatorCommandDependencies = Readonly<{
    environment?: RepositoryOperatorEnvironment;
    execute?: typeof executeRepositoryOperator;
    getAccessToken?: (cmsUrl: string) => Promise<string | null>;
    write?: (line: string) => void;
    writeError?: (line: string) => void;
}>;

export async function runRepositoryOperatorCommand(
    args: readonly string[],
    dependencies: RepositoryOperatorCommandDependencies = {},
): Promise<number> {
    const write = dependencies.write ?? console.log;
    const writeError = dependencies.writeError ?? console.error;
    let config;
    try {
        config = parseRepositoryOperatorConfig(args, dependencies.environment ?? process.env);
    } catch (error) {
        writeError(safeConfigurationError(error));
        writeError(REPOSITORY_OPERATOR_HELP);
        return 1;
    }
    if (config === "help") {
        write(REPOSITORY_OPERATOR_HELP);
        return 0;
    }
    let token: string | null;
    try {
        token = await (dependencies.getAccessToken ?? getAccessToken)(config.credentialLookupUrl);
    } catch {
        writeError("CMS Personal Access Token store could not be read");
        return 1;
    }
    if (!token) {
        writeError(
            "No CMS Personal Access Token found; create one in admin Profile and configure P9R_TOKEN or credentials.json",
        );
        return 1;
    }
    const result = await (dependencies.execute ?? executeRepositoryOperator)(
        {
            managementUrl: repositoryManagementUrlForCms(config.cmsUrl),
            token,
            timeoutMs: config.timeoutMs,
        },
        config.operation,
    );
    if (result.outcome === "failed") {
        writeError(failureLine(config.operation.type, config.operation.kind, config.operation.version, result));
        return 1;
    }
    write(successLine(config.operation.kind, config.operation.version, result));
    return 0;
}

function successLine(kind: string, version: string, result: Exclude<RepositoryOperatorResult, { outcome: "failed" }>) {
    if (result.outcome === "blocked") {
        return `BLOCKED ${kind}@${version} reference=${result.reference} ${channelChanges(result.preview)}`;
    }
    const action = result.outcome === "promoted" ? "PROMOTED" : "REEVALUATED";
    return `${action} ${kind}@${version} reference=${result.reference}`;
}

function channelChanges(preview: ChannelPreview): string {
    return `stable=${change(preview.current.stable, preview.next.stable)} latest=${change(
        preview.current.latest,
        preview.next.latest,
    )}`;
}

function change(before: string | undefined, after: string | undefined): string {
    return `${before ?? "none"}->${after ?? "none"}`;
}

function failureLine(
    operation: string,
    kind: string,
    version: string,
    failure: Extract<RepositoryOperatorResult, { outcome: "failed" }>,
): string {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `FAILED ${operation} ${kind}@${version} reason=${failure.reason}${status}${code}${retry}`;
}

function safeConfigurationError(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Repository operation configuration is invalid";
    }
    return error.message.replace(/[\r\n]/gu, " ").slice(0, 240);
}
