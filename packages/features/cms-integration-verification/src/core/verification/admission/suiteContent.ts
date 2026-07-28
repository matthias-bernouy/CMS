import {
    canonicalJsonBytes,
    resolveCanonicalFileSetLimits,
    sha256Hex,
    validateCanonicalFileSet,
    type CanonicalFile,
    type CanonicalFileSet,
} from "@bernouy/cms-integration-packages";
import type {
    IntegrationVerificationAuthorSuiteType,
    IntegrationVerificationSuiteContentV2,
} from "../../../interfaces/verification";
import { INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA } from "../../../interfaces/verification";
import { IntegrationVerificationContractError, wrapPackageValidation } from "../../validation/errors";
import { collectVerificationSuiteSourceClosure } from "../../validation/suiteSources";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { requiredText, stableIdentifier, supportedVersionRange } from "../../validation/values";

export type IdentifiedIntegrationVerificationSuiteContentV2 = Readonly<{
    content: IntegrationVerificationSuiteContentV2;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export async function identifyIntegrationVerificationSuiteContent(
    value: unknown,
): Promise<IdentifiedIntegrationVerificationSuiteContentV2> {
    const content = await validateIntegrationVerificationSuiteContent(value);
    const canonicalBytes = canonicalJsonBytes(content);
    return Object.freeze({ content, canonicalBytes, digest: await sha256Hex(canonicalBytes) });
}

export async function validateIntegrationVerificationSuiteContent(
    value: unknown,
): Promise<IntegrationVerificationSuiteContentV2> {
    assertContractIJson(value);
    const input = strictRecord(value, "suiteContent", ["schema", "type", "suite", "sources", "fixtures"]);
    if (input.schema !== INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA) {
        throw invalid("suiteContent.schema", `must be ${INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA}`);
    }
    const type = authorSuiteType(input.type);
    const suite = parseSuite(input.suite, type);
    const sources = parseFiles(input.sources, "suiteContent.sources", true);
    const fixtures = parseFiles(input.fixtures, "suiteContent.fixtures", false);
    const files = validatedFiles([...sources, ...fixtures]);
    const closure = await collectVerificationSuiteSourceClosure(files, suite.entrypoint);
    if (!sameEntries(sources, closure)) {
        throw invalid("suiteContent.sources", "must contain every and only module in the exact entrypoint closure");
    }
    const content: IntegrationVerificationSuiteContentV2 = {
        schema: INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA,
        type,
        suite,
        sources,
        fixtures,
    };
    const limits = resolveCanonicalFileSetLimits();
    if (canonicalJsonBytes(content).byteLength > limits.maxDocumentBytes) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `canonical suite content exceeds ${limits.maxDocumentBytes} bytes`,
            "suiteContent",
        );
    }
    return Object.freeze(content);
}

function parseSuite(
    value: unknown,
    type: IntegrationVerificationAuthorSuiteType,
): IntegrationVerificationSuiteContentV2["suite"] {
    const field = "suiteContent.suite";
    if (type === "contract") {
        const input = strictRecord(value, field, ["contractId", "entrypoint", "activeMajorRange"]);
        return Object.freeze({
            contractId: stableIdentifier(input.contractId, `${field}.contractId`),
            entrypoint: requiredText(input.entrypoint, `${field}.entrypoint`, 4_096),
            activeMajorRange: supportedVersionRange(input.activeMajorRange, `${field}.activeMajorRange`),
        });
    }
    const input = strictRecord(value, field, ["suiteId", "entrypoint"]);
    return Object.freeze({
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        entrypoint: requiredText(input.entrypoint, `${field}.entrypoint`, 4_096),
    });
}

function parseFiles(value: unknown, field: string, requireSource: boolean) {
    const entries = boundedArray(
        value,
        field,
        (entry, entryField) => {
            const input = strictRecord(entry, entryField, ["path", "file"]);
            return { path: requiredText(input.path, `${entryField}.path`, 4_096), file: input.file };
        },
        requireSource ? { minimum: 1 } : {},
    );
    assertUnique(
        entries.map((entry) => entry.path),
        `${field}.path`,
    );
    const parsed = validatedFiles(entries);
    const result = entries.map(({ path }) => Object.freeze({ path, file: Object.freeze({ ...parsed[path]! }) }));
    const sorted = result.toSorted((left, right) => compareText(left.path, right.path));
    if (!result.every((entry, index) => entry.path === sorted[index]?.path)) {
        throw invalid(field, "must be sorted by canonical path");
    }
    return Object.freeze(result);
}

function validatedFiles(entries: readonly Readonly<{ path: string; file: unknown }>[]): CanonicalFileSet {
    const values: Record<string, unknown> = {};
    for (const entry of entries) {
        if (Object.hasOwn(values, entry.path) && !sameCanonical(values[entry.path], entry.file)) {
            throw invalid(`suiteContent.files.${entry.path}`, "has conflicting source and fixture contents");
        }
        values[entry.path] = entry.file;
    }
    return wrapPackageValidation(() => validateCanonicalFileSet(values));
}

function authorSuiteType(value: unknown): IntegrationVerificationAuthorSuiteType {
    if (value !== "contract" && value !== "conformance") {
        throw invalid("suiteContent.type", "must be contract or conformance");
    }
    return value;
}

function sameEntries(
    left: readonly Readonly<{ path: string; file: CanonicalFile }>[],
    right: readonly Readonly<{ path: string; file: CanonicalFile }>[],
): boolean {
    return left.length === right.length && left.every((entry, index) => sameCanonical(entry, right[index]));
}

function sameCanonical(left: unknown, right: unknown): boolean {
    const a = canonicalJsonBytes(left);
    const b = canonicalJsonBytes(right);
    return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
