import { assertIJson } from "cms-repository/exports/contracts/protocol";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";
import {
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    normalizeProviderManifestLimits,
    type ProviderManifestLimits,
} from "../limits";
import { parseProviderManifest } from "../parsing/parseProviderManifest";
import { expectRecord, expectString, rejectUnknownKeys } from "../values";
import type { AdmittedProviderManifest } from "./admitProviderManifest";
import { sealProviderManifest } from "./sealProviderManifest";

/** Verify bounded structure and artifact integrity; current reference availability is checked at publication. */
export async function verifyProviderManifestAdmission(
    admission: AdmittedProviderManifest,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<AdmittedProviderManifest> {
    const bounded = normalizeProviderManifestLimits(limits);
    try {
        assertIJson(admission, bounded.maxJsonDepth + 1);
    } catch (error) {
        translateContractError(error);
    }
    const record = expectRecord(admission, "$");
    rejectUnknownKeys(record, ["kind", "manifest", "canonicalJson", "digest"], "$");
    if (record.kind !== "admitted-provider-manifest") {
        throw new ProviderManifestValidationError("invalid_manifest", "expected an admitted provider manifest");
    }
    const canonicalJson = expectString(record.canonicalJson, "$.canonicalJson", bounded.maxDocumentBytes);
    const digest = expectString(record.digest, "$.digest", 71);
    const verified = await sealProviderManifest(parseProviderManifest(record.manifest, bounded), bounded);
    if (verified.canonicalJson !== canonicalJson || verified.digest !== digest) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "admitted manifest artifact failed integrity verification",
        );
    }
    return verified;
}
