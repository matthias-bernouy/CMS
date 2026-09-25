import { parseIdentifier } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord } from "../../protocol/values";

export function parseScenarioProfiles(
    value: unknown,
    path: string,
    limits: Readonly<ReleaseLimits>,
): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, path, "invalid_contract");
    if (!source.length || source.length > limits.maxConformanceDependencyProfiles) {
        throw new ReleaseValidationError("invalid_contract", "scenario profiles must be nonempty and bounded", path);
    }
    const profiles = source.map((item, index) => parseIdentifier(item, `${path}[${index}]`));
    if (new Set(profiles).size !== profiles.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate scenario profile", path);
    }
    return profiles.sort();
}

export function indexScenarioProfiles(value: unknown, profileIds: readonly string[], limits: Readonly<ReleaseLimits>) {
    const source = expectArray(value, "$.scenarios", "invalid_contract");
    if (!source.length || source.length > limits.maxConformanceScenarios) {
        throw new ReleaseValidationError("invalid_contract", "invalid number of conformance scenarios", "$.scenarios");
    }
    const indexed = source.map((item, index) => {
        const path = `$.scenarios[${index}]`;
        const record = expectRecord(item, path, "invalid_contract");
        const id = parseIdentifier(record.id, `${path}.id`);
        const profiles = parseScenarioProfiles(record.profiles, `${path}.profiles`, limits);
        if (profiles?.some((profile) => !profileIds.includes(profile))) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "scenario selects an unknown dependency profile",
                `${path}.profiles`,
            );
        }
        return { id, value: record, profiles };
    });
    if (new Set(indexed.map((entry) => entry.id)).size !== indexed.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate conformance scenario IDs", "$.scenarios");
    }
    return indexed;
}
