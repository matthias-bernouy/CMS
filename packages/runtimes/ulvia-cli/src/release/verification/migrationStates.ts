import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import type { LocalReleasePackage } from "../types";

export function distinctMigrationBaselines(
    candidate: LocalReleasePackage,
    baselines: readonly LocalReleasePackage[],
): readonly LocalReleasePackage[] {
    const selected = new Map<string, LocalReleasePackage>();
    for (const baseline of baselines) {
        const key = migrationStateKey(candidate, baseline);
        if (!selected.has(key)) {
            selected.set(key, baseline);
        }
    }
    return [...selected.values()];
}

function migrationStateKey(candidate: LocalReleasePackage, baseline: LocalReleasePackage): string {
    const version = baseline.package.envelope.version;
    const states = (candidate.definition.connectors ?? [])
        .filter((connector) => connector.migration)
        .map((target) => {
            const source = (baseline.definition.connectors ?? []).find(
                (connector) =>
                    connector.connectorKey === target.connectorKey ||
                    (!connector.connectorKey &&
                        connector.provider === target.provider &&
                        (connector.root ?? ".") === (target.root ?? ".")),
            );
            const declaredSource = target.migration?.supportedSources.find((entry) =>
                integrationVersionSatisfies(version, entry.range),
            );
            return {
                connectorKey: target.connectorKey,
                provider: target.provider,
                lineageId: source?.lineageId ?? target.lineageId,
                migrationRevision: source?.migrationRevision ?? declaredSource?.migrationRevision ?? null,
                legacyPackageDigest: source?.migration
                    ? null
                    : (declaredSource?.legacyAdoption?.packageDigest ?? `unsupported:${version}`),
            };
        })
        .sort((left, right) => String(left.connectorKey).localeCompare(String(right.connectorKey)));
    return JSON.stringify(states);
}
