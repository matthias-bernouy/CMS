import type { CapabilityRequirement } from "../../../interfaces/ContractRelease";
import { ReleaseValidationError } from "../../protocol/errors";
import { expectArray } from "../../protocol/values";
import { compileVersionRange } from "./compile";
import { parseVersionRange } from "./parse";
import { isVersionSetEmpty, isVersionSetSubset, unionVersionSets } from "./sets";

/** Test/support partitions are explicit metadata, never inferred from the spelling of an accepted range. */
export function getRequirementSupportRanges(requirement: CapabilityRequirement): readonly string[] {
    return requirement.supportRanges ?? [requirement.versionRange];
}

export function parseRequirementSupportRanges(
    value: unknown,
    acceptedRange: string,
    path: string,
): readonly string[] | undefined {
    const accepted = compileVersionRange(acceptedRange);
    if (isVersionSetEmpty(accepted)) {
        throw new ReleaseValidationError("invalid_contract", "accepted dependency range must be nonempty", path);
    }
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, path, "invalid_contract");
    if (source.length === 0 || source.length > 4) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "support ranges must contain between 1 and 4 entries",
            path,
        );
    }
    const ranges = source.map((range, index) => parseVersionRange(range, `${path}[${index}]`));
    if (new Set(ranges).size !== ranges.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate support range", path);
    }
    const sets = ranges.map((range, index) => {
        const set = compileVersionRange(range);
        if (isVersionSetEmpty(set) || !isVersionSetSubset(set, accepted)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "support range must be a nonempty subset of accepted versions",
                `${path}[${index}]`,
            );
        }
        return set;
    });
    if (!isVersionSetSubset(accepted, unionVersionSets(sets))) {
        throw new ReleaseValidationError("invalid_contract", "support ranges must cover all accepted versions", path);
    }
    return ranges.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
