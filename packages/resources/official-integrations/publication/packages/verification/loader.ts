import { canonicalJsonBytes, parseStrictJsonDocument, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    parseIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../../../index";
import { joinWithin, readBoundedJsonDocument } from "../../filesystem";
import { buildOfficialIntegrationPackages } from "../runtime";
import type { BuiltOfficialIntegrationVerification, OfficialIntegrationVerificationBackfill } from "./contracts";
import { OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH } from "./contracts";
import { verificationObjectPath } from "./paths";
import { parseOfficialVerificationBackfillIndex, selectOfficialVerificationBackfillPackages } from "./validation";

const MAX_BACKFILL_INDEX_BYTES = 1 * 1_024 * 1_024;
const MAX_VERIFICATION_BUNDLE_BYTES = 32 * 1_024 * 1_024;

export async function loadOfficialIntegrationVerificationBackfill(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<OfficialIntegrationVerificationBackfill> {
    const loadedIndex = await loadOfficialVerificationBackfillIndex(requestedRoot);
    const index = loadedIndex.index;
    const indexCanonicalBytes = loadedIndex.indexCanonicalBytes;
    const packages = await buildOfficialIntegrationPackages(requestedRoot);
    selectOfficialVerificationBackfillPackages(packages, index);
    const verifications = await Promise.all(
        index.entries.map(async (entry): Promise<BuiltOfficialIntegrationVerification> => {
            const document = await readBoundedJsonDocument(
                verificationObjectPath(requestedRoot, entry.verificationDigest),
                MAX_VERIFICATION_BUNDLE_BYTES,
            );
            const envelope = parseIntegrationVerificationEnvelope(document.bytes);
            const canonicalBytes = canonicalJsonBytes(envelope);
            if (!equalBytes(document.bytes, canonicalBytes)) {
                throw new Error("Official verification bundle must be canonical JSON");
            }
            const verificationDigest = await computeIntegrationVerificationDigest(envelope);
            if (
                verificationDigest !== entry.verificationDigest ||
                envelope.target.kind !== entry.kind ||
                envelope.target.version !== entry.version ||
                envelope.target.packageDigest !== entry.packageDigest
            ) {
                throw new Error("Official verification bundle differs from its exact backfill binding");
            }
            return {
                kind: entry.kind,
                version: entry.version,
                packageDigest: entry.packageDigest,
                verificationDigest,
                envelope,
                canonicalBytes,
            };
        }),
    );
    return {
        index,
        indexDigest: loadedIndex.indexDigest,
        indexCanonicalBytes,
        verifications,
    };
}

export async function loadOfficialVerificationBackfillIndex(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<Pick<OfficialIntegrationVerificationBackfill, "index" | "indexDigest" | "indexCanonicalBytes">> {
    const indexDocument = await readBoundedJsonDocument(
        joinWithin(requestedRoot, OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH),
        MAX_BACKFILL_INDEX_BYTES,
    );
    const index = parseOfficialVerificationBackfillIndex(
        parseStrictJsonDocument(indexDocument.bytes, MAX_BACKFILL_INDEX_BYTES),
    );
    const indexCanonicalBytes = canonicalJsonBytes(index);
    if (!equalBytes(indexDocument.bytes, indexCanonicalBytes)) {
        throw new Error("Official verification backfill index must be canonical JSON");
    }
    return {
        index,
        indexDigest: await sha256Hex(indexCanonicalBytes),
        indexCanonicalBytes,
    };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
