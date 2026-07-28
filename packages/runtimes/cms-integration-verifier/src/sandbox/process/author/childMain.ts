import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { runAuthorSuiteInVm } from "./childRuntime";
import {
    AUTHOR_SUITE_LIMITS,
    canonicalJsonLine,
    readBoundedCanonicalJsonLines,
    type AuthorSuiteChildConfig,
    type AuthorSuiteQueryRequest,
    type AuthorSuiteQueryResponse,
} from "./protocol";

async function runAuthorSuiteChild(): Promise<void> {
    const lines = readBoundedCanonicalJsonLines(process.stdin, {
        maxTotalBytes: AUTHOR_SUITE_LIMITS.maxInputBytes,
        maxLineBytes: AUTHOR_SUITE_LIMITS.maxConfigBytes,
    });
    const first = await lines.next();
    if (first.done) {
        throw new TypeError("Author suite child input is absent");
    }
    const config = parseConfig(first.value);
    const result = await runAuthorSuiteInVm(config, async (canonicalRequest) => {
        const request = parseQueryRequest(JSON.parse(canonicalRequest));
        await writeStdout(canonicalJsonLine(request));
        const response = await lines.next();
        if (response.done) {
            throw new TypeError("Author suite query response is absent");
        }
        const parsed = parseQueryResponse(response.value, request.id);
        return new TextDecoder().decode(canonicalJsonBytes(parsed));
    });
    await writeStdout(canonicalJsonLine(result));
    process.stdin.destroy();
}

function parseConfig(value: unknown): AuthorSuiteChildConfig {
    const input = record(value, ["schema", "bundleSource", "fixtures"]);
    if (
        input.schema !== "cms.integration.author-suite-child-input.v1" ||
        typeof input.bundleSource !== "string" ||
        Buffer.byteLength(input.bundleSource) > AUTHOR_SUITE_LIMITS.maxConfigBytes
    ) {
        throw new TypeError("Author suite child config is invalid");
    }
    const fixtures = record(input.fixtures);
    for (const [path, value] of Object.entries(fixtures)) {
        const fixture = record(value, ["content", "encoding"]);
        if (
            !path ||
            (fixture.encoding !== "utf8" && fixture.encoding !== "base64") ||
            typeof fixture.content !== "string"
        ) {
            throw new TypeError("Author suite fixture config is invalid");
        }
    }
    return input as AuthorSuiteChildConfig;
}

function parseQueryRequest(value: unknown): AuthorSuiteQueryRequest {
    const input = record(value, ["type", "id", "statement", "parameters"]);
    if (
        input.type !== "query" ||
        !Number.isSafeInteger(input.id) ||
        (input.id as number) < 1 ||
        typeof input.statement !== "string" ||
        !Array.isArray(input.parameters)
    ) {
        throw new TypeError("Author suite query request is invalid");
    }
    return input as AuthorSuiteQueryRequest;
}

function parseQueryResponse(value: unknown, requestId: number): AuthorSuiteQueryResponse {
    const input = record(
        value,
        value && (value as { ok?: unknown }).ok === true ? ["type", "id", "ok", "rows"] : ["type", "id", "ok", "code"],
    );
    if (input.type !== "query-result" || input.id !== requestId || typeof input.ok !== "boolean") {
        throw new TypeError("Author suite query response is invalid");
    }
    return input as AuthorSuiteQueryResponse;
}

function record(value: unknown, fields?: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Author suite protocol value must be an object");
    }
    const input = value as Record<string, unknown>;
    if (fields) {
        const actual = Object.keys(input).toSorted();
        const expected = [...fields].toSorted();
        if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
            throw new TypeError("Author suite protocol object has unknown or missing fields");
        }
    }
    return input;
}

async function writeStdout(bytes: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        process.stdout.write(Buffer.from(bytes), (error) => (error ? reject(error) : resolve()));
    });
}

if (import.meta.main) {
    try {
        await runAuthorSuiteChild();
    } catch {
        process.stderr.write('{"event":"author-suite-child-failed"}\n');
        process.exitCode = 1;
    }
}
