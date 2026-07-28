import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { VerificationQueryParameter, VerificationQueryRow } from "@bernouy/cms-integration-verification/sdk/v1";

export const AUTHOR_SUITE_LIMITS = Object.freeze({
    timeoutMs: 15_000,
    terminationGraceMs: 500,
    maxConfigBytes: 40 * 1_048_576,
    maxInputBytes: 48 * 1_048_576,
    maxOutputBytes: 4 * 1_048_576,
    maxErrorBytes: 16_384,
    maxLineBytes: 1_048_576,
    maxQueries: 128,
    maxStatementBytes: 65_536,
    maxParameterBytes: 262_144,
    maxResponseBytes: 1_048_576,
    maxRows: 1_024,
    maxTests: 128,
});

export type AuthorSuiteChildConfig = Readonly<{
    schema: "cms.integration.author-suite-child-input.v1";
    bundleSource: string;
    fixtures: Readonly<
        Record<
            string,
            Readonly<{
                encoding: "utf8" | "base64";
                content: string;
            }>
        >
    >;
}>;

export type AuthorSuiteQueryRequest = Readonly<{
    type: "query";
    id: number;
    statement: string;
    parameters: readonly VerificationQueryParameter[];
}>;

export type AuthorSuiteQueryResponse =
    | Readonly<{ type: "query-result"; id: number; ok: true; rows: readonly VerificationQueryRow[] }>
    | Readonly<{ type: "query-result"; id: number; ok: false; code: "query-failed" | "query-limit" }>;

export type AuthorSuiteTestEvidence = Readonly<{
    name: string;
    outcome: "passed" | "failed";
    durationMs: number;
    code?: "assertion-failed" | "invalid-suite-export" | "test-threw";
}>;

export type AuthorSuiteChildResult = Readonly<{
    type: "result";
    tests: readonly AuthorSuiteTestEvidence[];
}>;

export type AuthorSuiteCanonicalEvidence = Readonly<{
    schema: "cms.integration.author-suite-evidence.v1";
    suiteId: string;
    suiteDigest: string;
    outcome: "passed" | "failed";
    tests: readonly Readonly<Omit<AuthorSuiteTestEvidence, "durationMs">>[];
}>;

export function canonicalJsonLine(value: unknown): Uint8Array {
    const bytes = canonicalJsonBytes(value);
    const line = new Uint8Array(bytes.byteLength + 1);
    line.set(bytes);
    line[line.byteLength - 1] = 0x0a;
    return line;
}

export async function* readBoundedCanonicalJsonLines(
    stream: AsyncIterable<Uint8Array | string>,
    limits: Readonly<{ maxTotalBytes: number; maxLineBytes: number }>,
): AsyncGenerator<unknown> {
    let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let total = 0;
    for await (const chunk of stream) {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
        total += bytes.byteLength;
        if (total > limits.maxTotalBytes) {
            throw new TypeError("Author suite protocol exceeds its total byte limit");
        }
        pending = concatenate(pending, bytes);
        let newline = pending.indexOf(0x0a);
        while (newline >= 0) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            if (line.byteLength === 0 || line.byteLength > limits.maxLineBytes) {
                throw new TypeError("Author suite protocol line is empty or too large");
            }
            const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
            const canonical = canonicalJsonBytes(value);
            if (!sameBytes(line, canonical)) {
                throw new TypeError("Author suite protocol line is not canonical JSON");
            }
            yield value;
            newline = pending.indexOf(0x0a);
        }
        if (pending.byteLength > limits.maxLineBytes) {
            throw new TypeError("Author suite protocol line exceeds its byte limit");
        }
    }
    if (pending.byteLength !== 0) {
        throw new TypeError("Author suite protocol ended with an incomplete line");
    }
}

function concatenate(
    left: Uint8Array<ArrayBufferLike>,
    right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
    const value = new Uint8Array(left.byteLength + right.byteLength);
    value.set(left);
    value.set(right, left.byteLength);
    return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
