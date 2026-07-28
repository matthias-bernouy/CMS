import { DEFAULT_CANONICAL_FILE_SET_LIMITS, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import { wrapPackageValidation } from "./errors";

export function parseVerificationJsonDocument(
    input: string | Uint8Array,
    maxDocumentBytes = DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDocumentBytes,
): unknown {
    return wrapPackageValidation(() => parseStrictJsonDocument(input, maxDocumentBytes));
}
