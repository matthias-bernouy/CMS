import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { compare } from "semver";
import type { LocalPackageRecord } from "../repository/manifest";

export function orderPushRecords(records: readonly LocalPackageRecord[]): readonly LocalPackageRecord[] {
    const targets = [...records].sort(compareRecords);
    const ordered: LocalPackageRecord[] = [];
    const complete = new Set<string>();
    const visiting: string[] = [];

    const visit = (record: LocalPackageRecord): void => {
        const key = coordinate(record);
        if (complete.has(key)) {
            return;
        }
        const cycleAt = visiting.indexOf(key);
        if (cycleAt >= 0) {
            throw new Error(`Local release dependency cycle includes ${[...visiting.slice(cycleAt), key].join(" → ")}`);
        }
        visiting.push(key);
        const previous = targets.filter(
            (candidate) => candidate.kind === record.kind && compare(candidate.version, record.version) < 0,
        );
        for (const candidate of previous) {
            visit(candidate);
        }
        for (const dependency of [...(record.definition.dependencies ?? [])]
            .filter((entry) => !entry.optional)
            .sort((left, right) => left.kind.localeCompare(right.kind))) {
            for (const candidate of targets.filter(
                (entry) =>
                    entry.kind === dependency.kind &&
                    (!dependency.versionRange || integrationVersionSatisfies(entry.version, dependency.versionRange)),
            )) {
                visit(candidate);
            }
        }
        visiting.pop();
        complete.add(key);
        ordered.push(record);
    };

    for (const record of targets) {
        visit(record);
    }
    return ordered;
}

function compareRecords(left: LocalPackageRecord, right: LocalPackageRecord): number {
    return left.kind.localeCompare(right.kind) || compare(left.version, right.version);
}

function coordinate(record: Pick<LocalPackageRecord, "kind" | "version">): string {
    return `${record.kind}@${record.version}`;
}
