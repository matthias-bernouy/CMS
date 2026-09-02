import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { compare } from "semver";
import { resolve } from "node:path";
import type { LocalIntegrationRepository } from "../repository/local";
import type { RemoteIntegrationRepository } from "../repository/remote";
import { assertLocalCompatibility, evaluateLocalCompatibility } from "../release/compatibility";
import { ensureLocalBaselines, loadLocalReleasePackages, resolveRequiredPackages } from "../release/packages";
import { readLocalReleaseSource } from "../release/source";
import type { LocalReleaseVerifier } from "../release/types";

type ReleaseFlags = Readonly<{ kind: string; root: string; version?: string }>;

export async function releaseCommand(
    args: readonly string[],
    cwd: string,
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    verifier: LocalReleaseVerifier,
    log: (message: string) => void,
): Promise<void> {
    const flags = parseReleaseFlags(args, cwd);
    const candidate = await readLocalReleaseSource(flags.root, flags.kind, flags.version);
    const { kind, version } = candidate.package.envelope;
    const existing = await local.getRecord(kind, version);
    if (existing) {
        if (existing.digest !== candidate.package.digest) {
            throw new Error(`Local package coordinate ${kind}@${version} already has a different digest`);
        }
        log(`= ${kind}@${version} already released locally (${shortDigest(existing.digest)})`);
        return;
    }
    const newer = (await local.list()).find((record) => record.kind === kind && compare(record.version, version) > 0);
    if (newer) {
        throw new Error(`Cannot release ${kind}@${version} after local version ${newer.version}`);
    }
    const publishedVersions = await remote.versions(kind);
    if (publishedVersions.includes(version)) {
        const published = await remote.pull(kind, version);
        if (published.package.digest !== candidate.package.digest) {
            throw new Error(`Remote package coordinate ${kind}@${version} already has a different immutable digest`);
        }
        const stored = await local.store(published);
        log(`= ${kind}@${version} is already published (${shortDigest(stored.record.digest)})`);
        return;
    }
    const baselineRecords = await ensureLocalBaselines(kind, version, local, remote, log, publishedVersions);
    const baselines = await loadLocalReleasePackages(baselineRecords, local);
    const compatibility = evaluateLocalCompatibility(candidate, baselines);
    assertLocalCompatibility(compatibility);
    log(`✓ compatibility: ${compatibility.releaseLevel} release, requires ${compatibility.requiredReleaseLevel}`);
    const dependencies = await resolveRequiredPackages([candidate, ...baselines], local, remote, log);
    await verifier.verify({ candidate, baselines, availablePackages: dependencies });
    const stored = await local.store({
        package: candidate.package,
        definition: candidate.definition,
        source: `local:${candidate.integrationRoot}`,
    });
    log(`+ ${kind}@${version} released locally (${shortDigest(stored.record.digest)})`);
}

function parseReleaseFlags(args: readonly string[], cwd: string): ReleaseFlags {
    let kind: string | undefined;
    let root = cwd;
    let version: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]!;
        if (argument === "--root" || argument.startsWith("--root=")) {
            const value = argument === "--root" ? args[++index] : argument.slice("--root=".length);
            if (!value) {
                throw new Error("--root requires a source directory");
            }
            root = resolve(cwd, value);
            continue;
        }
        if (argument === "--version" || argument.startsWith("--version=")) {
            const value = argument === "--version" ? args[++index] : argument.slice("--version=".length);
            if (!value) {
                throw new Error("--version requires an exact version");
            }
            version = assertIntegrationPackageVersion(value);
            continue;
        }
        if (argument.startsWith("-")) {
            throw new Error(`Unknown release option: ${argument}`);
        }
        if (kind) {
            throw new Error("release accepts one integration name");
        }
        kind = assertIntegrationPackageKind(argument);
    }
    if (!kind) {
        throw new Error("release requires an integration name");
    }
    return { kind, root, ...(version ? { version } : {}) };
}

function shortDigest(digest: string): string {
    return `sha256:${digest.slice(0, 12)}`;
}
