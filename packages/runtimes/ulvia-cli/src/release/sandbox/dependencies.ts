import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { compare, rcompare } from "semver";
import type { LocalReleasePackage } from "../types";
import type { ReleaseSandboxClient } from "./client";
import { sandboxAnswers } from "./answers";

export async function installRequiredDependencies(
    owner: LocalReleasePackage,
    packages: readonly LocalReleasePackage[],
    installed: Map<string, string>,
    client: ReleaseSandboxClient,
    visiting = new Set<string>(),
): Promise<void> {
    for (const dependency of owner.definition.dependencies ?? []) {
        if (dependency.optional) {
            continue;
        }
        const selected = packages
            .filter(
                (entry) =>
                    entry.package.envelope.kind === dependency.kind &&
                    (!dependency.versionRange ||
                        integrationVersionSatisfies(entry.package.envelope.version, dependency.versionRange)),
            )
            .sort((left, right) => rcompare(left.package.envelope.version, right.package.envelope.version))[0];
        if (!selected) {
            throw new Error(`Release sandbox is missing required dependency ${dependency.kind}`);
        }
        const key = coordinate(selected);
        if (visiting.has(key)) {
            throw new Error(`Release sandbox dependency cycle includes ${key}`);
        }
        visiting.add(key);
        await installRequiredDependencies(selected, packages, installed, client, visiting);
        visiting.delete(key);
        await ensureInstalled(selected, installed, client);
    }
}

async function ensureInstalled(
    selected: LocalReleasePackage,
    installed: Map<string, string>,
    client: ReleaseSandboxClient,
): Promise<void> {
    const { kind, version } = selected.package.envelope;
    const current = installed.get(kind);
    if (!current) {
        await client.install(kind, version, sandboxAnswers(selected.definition));
        installed.set(kind, version);
        return;
    }
    if (current === version) {
        return;
    }
    if (compare(current, version) >= 0) {
        throw new Error(`Release sandbox cannot downgrade dependency ${kind} from ${current} to ${version}`);
    }
    await client.upgrade(kind, version);
    installed.set(kind, version);
}

function coordinate(entry: LocalReleasePackage): string {
    return `${entry.package.envelope.kind}@${entry.package.envelope.version}`;
}
