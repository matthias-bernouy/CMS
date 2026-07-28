import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { compare as compareVersions } from "semver";
import type { BuiltOfficialIntegrationPackage } from "./contracts";
import { compareText } from "./filesystem";

export function resolveOfficialIntegrationDependencies(
    definition: IntegrationDefinition,
    packages: readonly BuiltOfficialIntegrationPackage[],
): readonly BuiltOfficialIntegrationPackage[] {
    const resolved: BuiltOfficialIntegrationPackage[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (current: IntegrationDefinition): void => {
        const dependencies = [...(current.dependencies ?? [])]
            .filter(({ optional }) => !optional)
            .sort((left, right) => compareText(left.kind, right.kind));
        for (const dependency of dependencies) {
            const selected = packages
                .filter(
                    (entry) =>
                        entry.kind === dependency.kind &&
                        (!dependency.versionRange ||
                            integrationVersionSatisfies(entry.version, dependency.versionRange)),
                )
                .sort((left, right) => compareVersions(right.version, left.version))[0];
            if (!selected) {
                throw new Error(
                    `Required official dependency cannot be resolved: ${current.kind} -> ${dependency.kind}`,
                );
            }
            const key = identity(selected.kind, selected.version);
            if (visited.has(key)) {
                continue;
            }
            if (visiting.has(key)) {
                throw new Error(`Required official dependency cycle includes ${key.replace("\0", "@")}`);
            }
            visiting.add(key);
            visit(selected.definition);
            visiting.delete(key);
            visited.add(key);
            resolved.push(selected);
        }
    };
    visit(definition);
    return Object.freeze(resolved);
}

function identity(kind: string, version: string): string {
    return `${kind}\0${version}`;
}
