import { assertIJson } from "@bernouy/ulvia-contracts/protocol";
import { translateContractError } from "../protocol/contractErrors";
import { ProviderManifestValidationError } from "../protocol/errors";
import { expectRecord, expectString, rejectUnknownKeys } from "../protocol/values";
import type { ProviderManifestYank } from "ulvia-providers/manifests/interfaces/ProviderManifestReader";

export function normalizeManifestYank(yank: ProviderManifestYank): ProviderManifestYank {
    try {
        assertIJson(yank, 2);
    } catch (error) {
        translateContractError(error);
    }
    const record = expectRecord(yank, "$.yank");
    rejectUnknownKeys(record, ["reason"], "$.yank");
    const reason = expectString(record.reason, "$.yank.reason", 1024);
    if (!reason.trim()) {
        throw new ProviderManifestValidationError("invalid_manifest", "must not be blank", "$.yank.reason");
    }
    return { reason };
}
