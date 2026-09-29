import { assertIJson } from "cms-repository/exports/contracts/protocol";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";
import { expectRecord, expectString, rejectUnknownKeys } from "../values";
import type { ProviderManifestYank } from "../../interfaces/ProviderManifestCatalogue";

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
