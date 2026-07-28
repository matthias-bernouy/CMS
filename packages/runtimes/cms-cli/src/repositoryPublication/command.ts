import {
    buildOfficialIntegrationCandidates,
    type BuiltOfficialIntegrationCandidate,
} from "@bernouy/cms-official-integrations/publication";
import { publishOfficialIntegrationCandidate } from "./candidate/client";
import type { ManagementCandidateResult } from "./candidate/contracts";
import {
    parseRepositoryPublicationConfig,
    REPOSITORY_PUBLICATION_HELP,
    type RepositoryPublicationEnvironment,
} from "./config";
import { readRepositoryPublicationToken } from "./tokenFile";

export type RepositoryPublicationCommandDependencies = Readonly<{
    environment?: RepositoryPublicationEnvironment;
    buildCandidates?: () => Promise<readonly BuiltOfficialIntegrationCandidate[]>;
    readToken?: (path: string) => Promise<string>;
    publish?: typeof publishOfficialIntegrationCandidate;
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

    let candidates: readonly BuiltOfficialIntegrationCandidate[];
    try {
        candidates = await (dependencies.buildCandidates ?? buildOfficialIntegrationCandidates)();
    } catch {
        writeError("Official integration candidate build failed");
        return 1;
    }
    write(`Official repository candidate plan: ${candidates.length} candidate(s)`);
    if (config.dryRun) {
        for (const candidate of candidates) {
            write(candidateLine("PLAN", candidate));
        }
        write(summary(candidates.length, 0, 0, 0, 0));
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
    const publish = dependencies.publish ?? publishOfficialIntegrationCandidate;
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const result = await publish({ managementUrl, token, timeoutMs: config.timeoutMs }, candidate);
        if (result.outcome === "published") {
            counts.published += 1;
            write(candidateLine("PUBLISHED", candidate));
            continue;
        }
        if (result.outcome === "unchanged") {
            counts.unchanged += 1;
            write(candidateLine("UNCHANGED", candidate));
            continue;
        }
        counts.failed += 1;
        counts.skipped = candidates.length - index - 1;
        writeError(failureLine(candidate, result));
        break;
    }
    write(summary(candidates.length, counts.published, counts.unchanged, counts.failed, counts.skipped));
    return counts.failed === 0 ? 0 : 1;
}

function candidateLine(action: string, candidate: BuiltOfficialIntegrationCandidate): string {
    return `${action} ${candidate.kind}@${candidate.version} package-sha256:${candidate.packageDigest} verification-sha256:${candidate.verificationDigest} candidate-sha256:${candidate.candidateDigest} ${candidate.canonicalBytes.byteLength} bytes`;
}

function failureLine(
    candidate: BuiltOfficialIntegrationCandidate,
    failure: Extract<ManagementCandidateResult, { outcome: "failed" }>,
): string {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `FAILED ${candidate.kind}@${candidate.version} reason=${failure.reason}${status}${code}${retry}`;
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
