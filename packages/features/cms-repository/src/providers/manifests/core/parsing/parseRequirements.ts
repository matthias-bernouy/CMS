import type { ProviderCapabilityRequirement } from "../../interfaces/ProviderManifest";
import {
    expectArray,
    expectBoolean,
    expectRecord,
    rejectUnknownKeys,
    unique,
    compareOrdinal,
} from "../protocol/values";
import { parseVersionRange } from "../versioning/versionRange";
import { parseIdentifier } from "./identifiers";

export function parseRequirements(value: unknown, path: string, maximum: number): ProviderCapabilityRequirement[] {
    const requirements = expectArray(value, path, maximum).map((value, index) => {
        const at = `${path}[${index}]`;
        const record = expectRecord(value, at);
        rejectUnknownKeys(record, ["contractId", "versionRange", "capabilityId", "optional"], at);
        return {
            contractId: parseIdentifier(record.contractId, `${at}.contractId`, 96),
            versionRange: parseVersionRange(record.versionRange, `${at}.versionRange`),
            capabilityId: parseIdentifier(record.capabilityId, `${at}.capabilityId`, 128),
            optional: expectBoolean(record.optional, `${at}.optional`),
        };
    });
    const key = (requirement: ProviderCapabilityRequirement) =>
        `${requirement.contractId}\0${requirement.capabilityId}`;
    unique(requirements.map(key), path);
    return requirements.sort((left, right) => compareOrdinal(key(left), key(right)));
}
