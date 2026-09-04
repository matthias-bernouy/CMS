import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { LocalIntegrationRepository } from "../repository/local";
import type { RemoteIntegrationRepository } from "../repository/remote";

type PullFlags = Readonly<{
    kind?: string;
    version?: string;
    all: boolean;
    allVersions: boolean;
}>;

export async function pullCommand(
    args: readonly string[],
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    log: (message: string) => void,
): Promise<void> {
    const flags = parsePullFlags(args);
    const targets = await pullTargets(flags, remote);
    if (!targets.length) {
        log("No integration packages are available to pull.");
        return;
    }
    for (const { kind, version } of targets) {
        const existing = await local.getRecord(kind, version);
        const result = await local.store(await remote.pull(kind, version));
        log(
            existing
                ? `= ${kind}@${version} already exists locally; refreshed repository evidence (${shortDigest(existing.digest)})`
                : `+ ${kind}@${version} (${shortDigest(result.record.digest)})`,
        );
    }
}

function parsePullFlags(args: readonly string[]): PullFlags {
    let kind: string | undefined;
    let version: string | undefined;
    let all = false;
    let allVersions = false;
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]!;
        if (argument === "--all") {
            all = true;
            continue;
        }
        if (argument === "--all-versions") {
            allVersions = true;
            continue;
        }
        if (argument === "--version" || argument.startsWith("--version=")) {
            const value = argument === "--version" ? args[++index] : argument.slice("--version=".length);
            if (!value) {
                throw new Error("--version requires an exact version or all");
            }
            if (value === "all") {
                allVersions = true;
            } else {
                version = assertIntegrationPackageVersion(value);
            }
            continue;
        }
        if (argument.startsWith("-")) {
            throw new Error(`Unknown pull option: ${argument}`);
        }
        if (kind) {
            throw new Error("pull accepts at most one integration name");
        }
        kind = assertIntegrationPackageKind(argument);
    }
    if (all && (kind || version || allVersions)) {
        throw new Error("--all cannot be combined with an integration name or version option");
    }
    if (!all && !kind) {
        throw new Error("pull requires an integration name or --all");
    }
    if (version && allVersions) {
        throw new Error("--version and --all-versions cannot be combined");
    }
    return { ...(kind ? { kind } : {}), ...(version ? { version } : {}), all, allVersions };
}

async function pullTargets(flags: PullFlags, remote: RemoteIntegrationRepository) {
    if (flags.all) {
        const kinds = (await remote.list()).map(({ kind }) => kind);
        return (
            await Promise.all(
                kinds.map(async (kind) => (await remote.versions(kind)).map((version) => ({ kind, version }))),
            )
        ).flat();
    }
    const kind = flags.kind!;
    if (flags.version) {
        return [{ kind, version: flags.version }];
    }
    if (flags.allVersions) {
        return (await remote.versions(kind)).map((version) => ({ kind, version }));
    }
    return [{ kind, version: await remote.defaultVersion(kind) }];
}

function shortDigest(digest: string): string {
    return `sha256:${digest.slice(0, 12)}`;
}
