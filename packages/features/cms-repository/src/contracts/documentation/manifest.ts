import type { ContractRelease } from "../interfaces/ContractRelease";
import { isReleaseDigest } from "../core/admission/digest";
import { ReleaseValidationError } from "../core/protocol/errors";
import { expectArray, expectRecord, expectSafeInteger, expectString, rejectUnknownKeys } from "../core/protocol/values";

export const DOCUMENTATION_LIMITS = Object.freeze({
    documents: 64,
    documentBytes: 128 * 1024,
    totalBytes: 4 * 1024 * 1024,
    references: 16,
});

export function documentationPath(value: unknown): string {
    if (
        typeof value !== "string" ||
        value.length > 256 ||
        !/^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/u.test(value) ||
        value.split("/").some((part) => part === "." || part === "..")
    ) {
        throw new ReleaseValidationError("invalid_contract", "invalid relative documentation path", "$.documentation");
    }
    return value;
}

export function parseDocumentation(value: unknown): ContractRelease["documentation"] {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, "$.documentation", "invalid_contract");
    if (source.length > DOCUMENTATION_LIMITS.documents) {
        throw new ReleaseValidationError("invalid_contract", "too many documents");
    }
    let total = 0;
    const documents = source.map((item) => {
        const row = expectRecord(item, "$.documentation", "invalid_contract");
        rejectUnknownKeys(row, ["path", "title", "byteLength", "digest"], "$.documentation", "invalid_contract");
        const path = documentationPath(row.path);
        const title = expectString(row.title, "$.documentation.title", "invalid_contract", 200);
        const byteLength = expectSafeInteger(row.byteLength, "$.documentation.byteLength", "invalid_contract");
        if (
            !title.trim() ||
            /[\x00-\x1f\x7f]/u.test(title) ||
            byteLength < 1 ||
            byteLength > DOCUMENTATION_LIMITS.documentBytes ||
            (total += byteLength) > DOCUMENTATION_LIMITS.totalBytes ||
            typeof row.digest !== "string" ||
            !isReleaseDigest(row.digest)
        ) {
            throw new ReleaseValidationError("invalid_contract", "invalid documentation metadata");
        }
        return { path, title, byteLength, digest: row.digest };
    });
    if (new Set(documents.map((doc) => doc.path)).size !== documents.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate document paths");
    }
    return documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function parseDocumentationReferences(value: unknown): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const paths = expectArray(value, "$.docs", "invalid_contract").map(documentationPath);
    if (paths.length > DOCUMENTATION_LIMITS.references || new Set(paths).size !== paths.length) {
        throw new ReleaseValidationError("invalid_contract", "invalid documentation references");
    }
    return paths;
}

export function contractAssetDefinitions(release: ContractRelease) {
    return [
        ...(release.fixtureAssets ?? []),
        ...(release.documentation ?? []).map((doc) => ({
            id: `docs/${doc.path}`,
            mediaType: "text/markdown",
            byteLength: doc.byteLength,
            digest: doc.digest,
        })),
    ];
}
