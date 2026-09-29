import { isVersionRangeSubset, parseVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionCapabilityRequirement } from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import type { CollectionLimits } from "../limits";
import { array, keys, ordinal, record, string, unique } from "../values";

export function parseRequirements(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionCapabilityRequirement[] {
    const requirements = array(value === undefined ? [] : value, limits.maxRequirementsPerBloc, path).map(
        (entry, index) => {
            const at = `${path}[${index}]`;
            const source = record(entry, at);
            keys(source, ["contractId", "capabilityId", "versionRange"], at);
            const versionRange = parseVersionRange(
                string(source.versionRange, 256, `${at}.versionRange`),
                `${at}.versionRange`,
            );
            if (isVersionRangeSubset(versionRange, "<0.0.0")) {
                invalid("must accept at least one contract version", `${at}.versionRange`);
            }
            return {
                contractId: contractIdentifier(source.contractId, 128, `${at}.contractId`),
                capabilityId: contractIdentifier(source.capabilityId, 128, `${at}.capabilityId`),
                versionRange,
            };
        },
    );
    unique(
        requirements.map((item) => `${item.contractId}/${item.capabilityId}`),
        path,
    );
    return requirements.sort((a, b) => ordinal(a.contractId, b.contractId) || ordinal(a.capabilityId, b.capabilityId));
}

function contractIdentifier(value: unknown, maximum: number, path: string): string {
    const parsed = string(value, maximum, path);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/.test(parsed)) {
        invalid("must be a canonical contract or capability identifier", path);
    }
    return parsed;
}
