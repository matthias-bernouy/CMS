import type { CapabilityRequirement } from "../../interfaces/ContractRelease";
import { ReleaseValidationError } from "../protocol/errors";
import type { ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, rejectUnknownKeys } from "../protocol/values";
import { parseVersionRange } from "../compatibility/versionRange";
import { compileVersionRange } from "../compatibility/ranges/compile";
import { isVersionSetEmpty } from "../compatibility/ranges/sets";
import { parseIdentifier } from "./identifiers";

export function parseCapabilityRequirements(
    value: unknown,
    path: string,
    limits: Readonly<ReleaseLimits>,
): readonly CapabilityRequirement[] {
    const source = expectArray(value, path, "invalid_contract");
    if (source.length === 0 || source.length > limits.maxProperties) {
        throw new ReleaseValidationError("invalid_contract", "requires must be nonempty and bounded", path);
    }
    const requirements = source.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = expectRecord(item, itemPath, "invalid_contract");
        rejectUnknownKeys(record, ["contractId", "capabilityId", "versionRange"], itemPath, "invalid_contract");
        const versionRange = parseVersionRange(record.versionRange, `${itemPath}.versionRange`);
        if (isVersionSetEmpty(compileVersionRange(versionRange))) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "accepted dependency range must be nonempty",
                `${itemPath}.versionRange`,
            );
        }
        return {
            contractId: parseIdentifier(record.contractId, `${itemPath}.contractId`, 96),
            capabilityId: parseIdentifier(record.capabilityId, `${itemPath}.capabilityId`),
            versionRange,
        };
    });
    const keys = requirements.map((requirement) => `${requirement.contractId}\u0000${requirement.capabilityId}`);
    if (new Set(keys).size !== keys.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate required capability", path);
    }
    return requirements.sort((left, right) => {
        if (left.contractId !== right.contractId) {
            return left.contractId < right.contractId ? -1 : 1;
        }
        return left.capabilityId < right.capabilityId ? -1 : left.capabilityId > right.capabilityId ? 1 : 0;
    });
}
