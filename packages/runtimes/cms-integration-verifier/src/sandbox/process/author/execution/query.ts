import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type {
    VerificationQuery,
    VerificationQueryRow,
    VerificationValue,
} from "@bernouy/cms-integration-verification/sdk/v1";
import { AUTHOR_SUITE_LIMITS, type AuthorSuiteChildResult, type AuthorSuiteQueryRequest } from "../protocol";

export async function executeAuthorQuery(request: AuthorSuiteQueryRequest, query: VerificationQuery) {
    let parameterBytes = Number.POSITIVE_INFINITY;
    try {
        parameterBytes = canonicalJsonBytes(request.parameters).byteLength;
    } catch {
        // Invalid author input is returned to the suite as a bounded query rejection.
    }
    if (
        Buffer.byteLength(request.statement) > AUTHOR_SUITE_LIMITS.maxStatementBytes ||
        request.parameters.length > 256 ||
        !request.parameters.every(validQueryParameter) ||
        parameterBytes > AUTHOR_SUITE_LIMITS.maxParameterBytes ||
        forbiddenTransactionStatement(request.statement)
    ) {
        return { type: "query-result" as const, id: request.id, ok: false as const, code: "query-limit" as const };
    }
    try {
        const rows = await query(request.statement, request.parameters);
        if (rows.length > AUTHOR_SUITE_LIMITS.maxRows) {
            throw new TypeError("row limit");
        }
        const normalized = rows.map(normalizeRow);
        return { type: "query-result" as const, id: request.id, ok: true as const, rows: normalized };
    } catch {
        return { type: "query-result" as const, id: request.id, ok: false as const, code: "query-failed" as const };
    }
}

export function parseAuthorSuiteQueryRequest(value: unknown, expectedId: number): AuthorSuiteQueryRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Author suite child protocol is invalid");
    }
    const input = value as Record<string, unknown>;
    if (
        !sameKeys(input, ["id", "parameters", "statement", "type"]) ||
        input.type !== "query" ||
        input.id !== expectedId ||
        typeof input.statement !== "string" ||
        !Array.isArray(input.parameters)
    ) {
        throw new TypeError("Author suite child protocol is invalid");
    }
    return input as AuthorSuiteQueryRequest;
}

export function isAuthorSuiteChildResult(value: unknown): value is AuthorSuiteChildResult {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const input = value as Record<string, unknown>;
    if (!sameKeys(input, ["tests", "type"]) || input.type !== "result" || !Array.isArray(input.tests)) {
        return false;
    }
    return input.tests.every((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const test = entry as Record<string, unknown>;
        const fields =
            test.code === undefined ? ["durationMs", "name", "outcome"] : ["code", "durationMs", "name", "outcome"];
        return (
            sameKeys(test, fields) &&
            typeof test.name === "string" &&
            Buffer.byteLength(test.name) <= 256 &&
            (test.outcome === "passed" || test.outcome === "failed") &&
            Number.isSafeInteger(test.durationMs) &&
            (test.durationMs as number) >= 0 &&
            (test.code === undefined ||
                ["assertion-failed", "invalid-suite-export", "test-threw"].includes(test.code as string))
        );
    });
}

function validQueryParameter(value: unknown): boolean {
    if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return true;
    }
    return Array.isArray(value) && value.length <= 1_024 && value.every(validQueryScalar);
}

function validQueryScalar(value: unknown): boolean {
    return (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}

function normalizeRow(row: VerificationQueryRow): VerificationQueryRow {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new TypeError("Verification query row is invalid");
    }
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value, 0)]));
}

function normalizeValue(value: unknown, depth: number): VerificationValue {
    if (depth > 16) {
        throw new TypeError("Verification query value is too deep");
    }
    if (value === null || typeof value === "boolean" || typeof value === "string") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString("base64");
    }
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeValue(entry, depth + 1));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                normalizeValue(entry, depth + 1),
            ]),
        );
    }
    throw new TypeError("Verification query value is not serializable");
}

function forbiddenTransactionStatement(statement: string): boolean {
    return (
        /\b(?:begin|commit|rollback|savepoint|transaction)\b/iu.test(statement) ||
        /\bcopy\b[\s\S]*\bprogram\b/iu.test(statement) ||
        /\bcreate\s+extension\b/iu.test(statement) ||
        /\b(?:dblink|lo_import|pg_read_file|pg_read_binary_file|postgres_fdw)\b/iu.test(statement)
    );
}

function sameKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
    const actual = Object.keys(value).toSorted();
    const expected = [...fields].toSorted();
    return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}
