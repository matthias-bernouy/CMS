import { buildOfficialIntegrationCandidates } from "@bernouy/cms-official-integrations/publication";
import { getAccessToken } from "../credentials";
import { buildIntegrationCandidates } from "./candidate/build";
import { publishIntegrationCandidate } from "./candidate/client";
import type { BuiltIntegrationCandidate, ManagementCandidateResult } from "./candidate/contracts";
import { IntegrationCandidateBuildError } from "./candidate/errors";
import { repositoryManagementUrlForCms } from "./candidate/managementUrl";
import {
    parseRepositoryPublicationConfig,
    REPOSITORY_PUBLICATION_HELP,
    type RepositoryPublicationConfig,
    type RepositoryPublicationEnvironment,
} from "./config";

export type RepositoryPublicationCommandDependencies = Readonly<{
    environment?: RepositoryPublicationEnvironment;
    buildCandidates?: (source: RepositoryPublicationConfig["source"]) => Promise<readonly BuiltIntegrationCandidate[]>;
    getAccessToken?: (cmsUrl: string) => Promise<string | null>;
    publish?: typeof publishIntegrationCandidate;
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

    let candidates: readonly BuiltIntegrationCandidate[];
    try {
        candidates = await (dependencies.buildCandidates ?? buildCandidates)(config.source);
    } catch (error) {
        writeError(candidateBuildFailure(config.source, error));
        return 1;
    }
    const planLabel = config.source.type === "official" ? "Official repository" : "Repository";
    write(`${planLabel} candidate plan: ${candidates.length} candidate(s)`);
    if (config.dryRun) {
        for (const candidate of candidates) {
            write(candidateLine("PLAN", candidate));
        }
        write(summary(candidates.length, 0, 0, 0, 0));
        return 0;
    }

    const cmsUrl = config.cmsUrl;
    if (!cmsUrl) {
        writeError("Repository publication configuration is incomplete");
        return 1;
    }
    let token: string | null;
    try {
        token = await (dependencies.getAccessToken ?? getAccessToken)(cmsUrl);
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

    const managementUrl = repositoryManagementUrlForCms(cmsUrl);
    const counts = { published: 0, unchanged: 0, failed: 0, skipped: 0 };
    const publish = dependencies.publish ?? publishIntegrationCandidate;
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

function candidateBuildFailure(source: RepositoryPublicationConfig["source"], error: unknown): string {
    if (source.type === "integration" && error instanceof IntegrationCandidateBuildError) {
        return `Integration candidate build failed [${error.code}]: ${error.message}`;
    }
    return source.type === "official"
        ? "Official integration candidate build failed"
        : "Integration candidate build failed";
}

async function buildCandidates(
    source: RepositoryPublicationConfig["source"],
): Promise<readonly BuiltIntegrationCandidate[]> {
    return source.type === "official"
        ? await buildOfficialIntegrationCandidates()
        : await buildIntegrationCandidates(source.root);
}

function candidateLine(action: string, candidate: BuiltIntegrationCandidate): string {
    return `${action} ${candidate.kind}@${candidate.version} package-sha256:${candidate.packageDigest} verification-sha256:${candidate.verificationDigest} candidate-sha256:${candidate.candidateDigest} ${candidate.canonicalBytes.byteLength} bytes`;
}

function failureLine(
    candidate: BuiltIntegrationCandidate,
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
