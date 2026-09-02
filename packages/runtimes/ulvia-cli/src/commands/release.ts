import { compare } from "semver";
import type { LocalIntegrationRepository } from "../repository/local";
import type { RemoteIntegrationRepository } from "../repository/remote";
import { auditPreparedLocalRelease, prepareLocalRelease } from "../release/audit";
import { listLocalReleaseKinds } from "../release/source";
import type { LocalReleaseVerifier } from "../release/types";
import { parseSourceCommandFlags } from "./source-flags";

export async function releaseCommand(
    args: readonly string[],
    cwd: string,
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    verifier: LocalReleaseVerifier,
    log: (message: string) => void,
): Promise<void> {
    const flags = parseSourceCommandFlags("release", args, cwd, { allowAll: true });
    const kinds = flags.all ? await listLocalReleaseKinds(flags.root) : [flags.kind!];
    const failures: { kind: string; error: unknown }[] = [];
    for (const kind of kinds) {
        try {
            await releaseOne(flags.root, kind, flags.version, local, remote, verifier, log);
        } catch (error) {
            if (!flags.all) {
                throw error;
            }
            failures.push({ kind, error });
            log(`✗ ${kind}: ${errorMessage(error)}`);
        }
    }
    if (failures.length) {
        throw new Error(`Release failed for ${failures.length} of ${kinds.length} integration(s)`);
    }
}

async function releaseOne(
    root: string,
    requestedKind: string,
    requestedVersion: string | undefined,
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    verifier: LocalReleaseVerifier,
    log: (message: string) => void,
): Promise<void> {
    const prepared = await prepareLocalRelease(root, requestedKind, requestedVersion, local, remote, {
        skipRemoteWhenLocal: true,
    });
    const { candidate, existing, published, publishedVersions } = prepared;
    const { kind, version } = candidate.package.envelope;
    if (existing) {
        log(`= ${kind}@${version} already released locally (${shortDigest(existing.digest)})`);
        return;
    }
    const newerLocal = (await local.list()).find(
        (record) => record.kind === kind && compare(record.version, version) > 0,
    );
    const newerRemote = publishedVersions.find((entry) => compare(entry.version, version) > 0);
    const newerVersion = newerLocal?.version ?? newerRemote?.version;
    if (newerVersion) {
        throw new Error(`Cannot release ${kind}@${version} after version ${newerVersion}`);
    }
    if (published) {
        const stored = await local.store(published);
        log(`= ${kind}@${version} is already published (${shortDigest(stored.record.digest)})`);
        return;
    }
    await auditPreparedLocalRelease(prepared, { local, remote, verifier, log });
    const stored = await local.store({
        package: candidate.package,
        definition: candidate.definition,
        source: `local:${candidate.integrationRoot}`,
    });
    log(`+ ${kind}@${version} released locally (${shortDigest(stored.record.digest)})`);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function shortDigest(digest: string): string {
    return `sha256:${digest.slice(0, 12)}`;
}
