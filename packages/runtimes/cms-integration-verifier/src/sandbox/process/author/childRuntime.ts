import vm from "node:vm";
import type { AuthorSuiteChildConfig, AuthorSuiteChildResult, AuthorSuiteQueryRequest } from "./protocol";
import { AUTHOR_SUITE_LIMITS } from "./protocol";

type HostBridge = (canonicalRequest: string) => Promise<string>;

export async function runAuthorSuiteInVm(
    config: AuthorSuiteChildConfig,
    hostBridge: HostBridge,
): Promise<AuthorSuiteChildResult> {
    const sandbox = Object.create(null) as Record<string, unknown>;
    const context = vm.createContext(sandbox, {
        name: "cms-integration-author-suite",
        codeGeneration: { strings: false, wasm: false },
    });
    sandbox.__cmsHostBridge = hostBridge;
    sandbox.__cmsFixtureConfig = JSON.stringify(config.fixtures);
    new vm.Script(BOOTSTRAP_SOURCE, { filename: "cms-author-bootstrap.js" }).runInContext(context, {
        timeout: 1_000,
    });
    new vm.Script(config.bundleSource, { filename: "cms-author-suite.js" }).runInContext(context, {
        timeout: 1_000,
    });
    const suite = sandbox.__cmsAuthorSuite;
    const suiteContext = sandbox.__cmsSuiteContext;
    delete sandbox.__cmsAuthorSuite;
    delete sandbox.__cmsSuiteContext;
    const tests = validatedTests(suite);
    if (!tests) {
        return {
            type: "result",
            tests: [{ name: "suite-definition", outcome: "failed", durationMs: 0, code: "invalid-suite-export" }],
        };
    }
    const evidence: AuthorSuiteChildResult["tests"][number][] = [];
    for (const test of tests) {
        const started = performance.now();
        try {
            await test.execute(suiteContext);
            evidence.push({ name: test.name, outcome: "passed", durationMs: elapsed(started) });
        } catch (error) {
            evidence.push({
                name: test.name,
                outcome: "failed",
                durationMs: elapsed(started),
                code: errorName(error) === "VerificationAssertionError" ? "assertion-failed" : "test-threw",
            });
        }
    }
    return { type: "result", tests: evidence };
}

function validatedTests(
    value: unknown,
): readonly Readonly<{ name: string; execute(context: unknown): unknown }>[] | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    let tests: unknown;
    try {
        if (!sameKeys(value, ["tests"])) {
            return null;
        }
        tests = (value as { tests?: unknown }).tests;
    } catch {
        return null;
    }
    if (!Array.isArray(tests) || tests.length === 0 || tests.length > AUTHOR_SUITE_LIMITS.maxTests) {
        return null;
    }
    const names = new Set<string>();
    const result: Array<Readonly<{ name: string; execute(context: unknown): unknown }>> = [];
    for (const candidate of tests) {
        try {
            if (!candidate || typeof candidate !== "object" || !sameKeys(candidate, ["execute", "name"])) {
                return null;
            }
            const { name, execute } = candidate as { name?: unknown; execute?: unknown };
            if (
                typeof name !== "string" ||
                name.length === 0 ||
                Buffer.byteLength(name) > 256 ||
                names.has(name) ||
                typeof execute !== "function"
            ) {
                return null;
            }
            names.add(name);
            result.push({ name, execute: execute as (context: unknown) => unknown });
        } catch {
            return null;
        }
    }
    return result;
}

function sameKeys(value: object, expected: readonly string[]): boolean {
    const keys = Object.keys(value).toSorted();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function errorName(error: unknown): string | undefined {
    try {
        return error && typeof error === "object" && typeof (error as { name?: unknown }).name === "string"
            ? (error as { name: string }).name
            : undefined;
    } catch {
        return undefined;
    }
}

function elapsed(started: number): number {
    return Math.max(0, Math.round(performance.now() - started));
}

const BOOTSTRAP_SOURCE = `
(() => {
    "use strict";
    const bridge = globalThis.__cmsHostBridge;
    const fixtures = JSON.parse(globalThis.__cmsFixtureConfig);
    delete globalThis.__cmsHostBridge;
    delete globalThis.__cmsFixtureConfig;
    let nextQueryId = 1;
    let queryQueue = Promise.resolve();
    const invoke = (request) => {
        const pending = queryQueue.then(async () => JSON.parse(await bridge(JSON.stringify(request))));
        queryQueue = pending.then(() => undefined, () => undefined);
        return pending;
    };
    const query = async (statement, parameters = []) => {
        const response = await invoke({ type: "query", id: nextQueryId++, statement, parameters });
        if (!response.ok) {
            const error = new Error("Verification query was rejected");
            error.name = "VerificationQueryError";
            throw error;
        }
        return response.rows;
    };
    const fixture = (path) => {
        if (!Object.prototype.hasOwnProperty.call(fixtures, path)) {
            throw new Error("Verification fixture was not found");
        }
        const value = fixtures[path];
        const bytes = () => (value.encoding === "utf8" ? utf8Bytes(value.content) : base64Bytes(value.content));
        return Object.freeze({
            encoding: value.encoding,
            text: () => (value.encoding === "utf8" ? value.content : utf8Text(bytes())),
            bytes,
        });
    };
    globalThis.__cmsSuiteContext = Object.freeze({ query, fixture });
})();

function base64Bytes(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new Error("Invalid fixture encoding");
    const output = [];
    for (let index = 0; index < value.length; index += 4) {
        const a = alphabet.indexOf(value[index]);
        const b = alphabet.indexOf(value[index + 1]);
        const c = value[index + 2] === "=" ? 0 : alphabet.indexOf(value[index + 2]);
        const d = value[index + 3] === "=" ? 0 : alphabet.indexOf(value[index + 3]);
        if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error("Invalid fixture encoding");
        const bits = (a << 18) | (b << 12) | (c << 6) | d;
        output.push((bits >> 16) & 255);
        if (value[index + 2] !== "=") output.push((bits >> 8) & 255);
        if (value[index + 3] !== "=") output.push(bits & 255);
    }
    return new Uint8Array(output);
}

function utf8Bytes(value) {
    const encoded = encodeURIComponent(value);
    const output = [];
    for (let index = 0; index < encoded.length; index += 1) {
        if (encoded[index] !== "%") {
            output.push(encoded.charCodeAt(index));
            continue;
        }
        output.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
        index += 2;
    }
    return new Uint8Array(output);
}

function utf8Text(bytes) {
    let encoded = "";
    for (const byte of bytes) encoded += "%" + byte.toString(16).padStart(2, "0");
    return decodeURIComponent(encoded);
}
`;
