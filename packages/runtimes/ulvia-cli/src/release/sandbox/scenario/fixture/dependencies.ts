import type { UpgradeFixtureDependencyV1 } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { compare, rcompare } from "semver";
import type { LocalReleasePackage } from "../../../types";
import { sandboxAnswers } from "../../answers";
import { ReleaseSandboxClient } from "../../client";
import { installRequiredDependencies } from "../../dependencies";

export async function installFixtureDependencies(
    dependencies: readonly UpgradeFixtureDependencyV1[],
    packages: readonly LocalReleasePackage[],
    installed: Map<string, string>,
    client: ReleaseSandboxClient,
): Promise<void> {
    for (const dependency of dependencies) {
        const selected = packages
            .filter(
                (entry) =>
                    entry.package.envelope.kind === dependency.kind &&
                    (!dependency.versionRange ||
                        integrationVersionSatisfies(entry.package.envelope.version, dependency.versionRange)),
            )
            .sort((left, right) => rcompare(left.package.envelope.version, right.package.envelope.version))[0];
        if (!selected) {
            throw new Error(
                `Upgrade fixture dependency ${dependency.kind}${dependency.versionRange ? `@${dependency.versionRange}` : ""} is unavailable`,
            );
        }
        await installRequiredDependencies(selected, packages, installed, client);
        await installOrUpgrade(selected, installed, client);
    }
}

async function installOrUpgrade(
    selected: LocalReleasePackage,
    installed: Map<string, string>,
    client: ReleaseSandboxClient,
): Promise<void> {
    const { kind, version } = selected.package.envelope;
    const current = installed.get(kind);
    if (!current) {
        await client.install(kind, version, sandboxAnswers(selected.definition));
    } else if (current !== version) {
        if (compare(current, version) > 0) {
            throw new Error(`Upgrade fixture cannot downgrade dependency ${kind} from ${current} to ${version}`);
        }
        await client.upgrade(kind, version);
    }
    installed.set(kind, version);
}
