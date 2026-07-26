import { buildOfficialIntegrationPackages, type OfficialIntegrationPackage } from "./officialPackages";
import { publishOfficialIntegrationPackage, type ManagementPublicationResult } from "./managementClient";
import {
    parseRepositoryPublicationConfig,
    REPOSITORY_PUBLICATION_HELP,
    type RepositoryPublicationEnvironment,
} from "./config";
import { readRepositoryPublicationToken } from "./tokenFile";

export type RepositoryPublicationCommandDependencies = Readonly<{
    environment?: RepositoryPublicationEnvironment;
    buildPackages?: () => Promise<readonly OfficialIntegrationPackage[]>;
    readToken?: (path: string) => Promise<string>;
    publish?: typeof publishOfficialIntegrationPackage;
    write?: (line: string) => void;
    writeError?: (line: string) => void;
}>;

export async function runRepositoryPublicationCommand(
    args: readonly string[],
    dependencies: RepositoryPublicationCommandDependencies = {},
): Promise<number> {
    const write = dependencies.write ?? console.log;
    const writeError = dependencies.writeError ?? console.error;
    let config;
    try {
        config = parseRepositoryPublicationConfig(args, dependencies.environment ?? process.env);
    } catch (error) {
        writeError(safeConfigurationError(error));
        writeError(REPOSITORY_PUBLICATION_HELP);
        return 1;
    }
    if (config === "help") {
        write(REPOSITORY_PUBLICATION_HELP);
        return 0;
    }

    let packages: readonly OfficialIntegrationPackage[];
    try {
        packages = await (dependencies.buildPackages ?? buildOfficialIntegrationPackages)();
    } catch {
        writeError("Official integration package build failed");
        return 1;
    }
    write(`Official repository publication plan: ${packages.length} package(s)`);
    if (config.dryRun) {
        for (const integrationPackage of packages) {
            write(packageLine("PLAN", integrationPackage));
        }
        write(summary(packages.length, 0, 0, 0, 0));
        return 0;
    }

    const managementUrl = config.managementUrl;
    const tokenFile = config.tokenFile;
    if (!managementUrl || !tokenFile) {
        writeError("Repository publication configuration is incomplete");
        return 1;
    }
    let token: string;
    try {
        token = await (dependencies.readToken ?? readRepositoryPublicationToken)(tokenFile);
    } catch {
        writeError("Repository management token file is invalid");
        return 1;
    }

    const counts = { published: 0, unchanged: 0, failed: 0, skipped: 0 };
    const publish = dependencies.publish ?? publishOfficialIntegrationPackage;
    for (let index = 0; index < packages.length; index += 1) {
        const integrationPackage = packages[index]!;
        const result = await publish({ managementUrl, token, timeoutMs: config.timeoutMs }, integrationPackage);
        if (result.outcome === "published") {
            counts.published += 1;
            write(packageLine("PUBLISHED", integrationPackage));
            continue;
        }
        if (result.outcome === "unchanged") {
            counts.unchanged += 1;
            write(packageLine("UNCHANGED", integrationPackage));
            continue;
        }
        counts.failed += 1;
        counts.skipped = packages.length - index - 1;
        writeError(failureLine(integrationPackage, result));
        break;
    }
    write(summary(packages.length, counts.published, counts.unchanged, counts.failed, counts.skipped));
    return counts.failed === 0 ? 0 : 1;
}

function packageLine(action: string, integrationPackage: OfficialIntegrationPackage): string {
    return `${action} ${integrationPackage.kind}@${integrationPackage.version} sha256:${integrationPackage.digest} ${integrationPackage.canonicalBytes.byteLength} bytes`;
}

function failureLine(
    integrationPackage: OfficialIntegrationPackage,
    failure: Extract<ManagementPublicationResult, { outcome: "failed" }>,
): string {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `FAILED ${integrationPackage.kind}@${integrationPackage.version} reason=${failure.reason}${status}${code}${retry}`;
}

function summary(planned: number, published: number, unchanged: number, failed: number, skipped: number): string {
    return `Summary: planned=${planned} published=${published} unchanged=${unchanged} failed=${failed} skipped=${skipped}`;
}

function safeConfigurationError(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Repository publication configuration is invalid";
    }
    return error.message.replace(/[\r\n]/gu, " ").slice(0, 240);
}
