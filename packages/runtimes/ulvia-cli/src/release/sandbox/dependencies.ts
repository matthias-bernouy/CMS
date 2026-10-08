import { integrationRuntimeDependencies, integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { compare, rcompare } from "semver";
import type { LocalReleasePackage } from "../types";
import type { ReleaseSandboxClient } from "./client";
import { sandboxAnswers } from "./answers";
import { ReleaseScenarioInfrastructureError } from "./scenario/errors";

export async function installRequiredDependencies(
    owner: LocalReleasePackage,
    packages: readonly LocalReleasePackage[],
    installed: Map<string, string>,
    client: ReleaseSandboxClient,
    visiting = new Set<string>(),
): Promise<void> {
    const requirements = Map.groupBy(integrationRuntimeDependencies(owner.definition), ({ kind }) => kind);
    const orderedRequirements = [...requirements].toSorted(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
    );
    for (const [kind, dependencies] of orderedRequirements) {
        const satisfiesEveryRange = (version: string) =>
            dependencies.every(
                ({ versionRange }) => !versionRange || integrationVersionSatisfies(version, versionRange),
            );
        const current = installed.get(kind);
        if (current && satisfiesEveryRange(current)) {
            continue;
        }
        const selected = packages
            .filter(
                (entry) => entry.package.envelope.kind === kind && satisfiesEveryRange(entry.package.envelope.version),
            )
            .sort((left, right) => rcompare(left.package.envelope.version, right.package.envelope.version))[0];
        if (!selected) {
            throw new Error(`Release sandbox is missing a compatible required dependency ${kind}`);
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
        try {
            await client.install(kind, version, sandboxAnswers(selected.definition));
        } catch (error) {
            throw new ReleaseScenarioInfrastructureError(
                new Error(`Could not prepare required dependency ${kind}@${version}`, { cause: error }),
            );
        }
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
