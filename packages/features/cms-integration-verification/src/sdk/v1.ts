export type VerificationScalar = null | boolean | number | string;
export type VerificationValue = VerificationScalar | VerificationArray | VerificationObject;
export interface VerificationArray extends ReadonlyArray<VerificationValue> {}
export interface VerificationObject {
    readonly [key: string]: VerificationValue;
}
export type VerificationQueryParameter = VerificationScalar | readonly VerificationScalar[];
export type VerificationQueryRow = Readonly<Record<string, VerificationValue>>;

export type VerificationQuery = (
    statement: string,
    parameters?: readonly VerificationQueryParameter[],
) => Promise<readonly VerificationQueryRow[]>;

export type VerificationFixture = Readonly<{
    encoding: "utf8" | "base64";
    text(): string;
    bytes(): Uint8Array;
}>;

export type VerificationSuiteContext = Readonly<{
    query: VerificationQuery;
    fixture(path: string): VerificationFixture;
}>;

export type VerificationTest = Readonly<{
    name: string;
    execute(context: VerificationSuiteContext): void | Promise<void>;
}>;

export type VerificationSuite = Readonly<{
    tests: readonly VerificationTest[];
}>;

export function defineSuite(input: Readonly<{ tests: readonly VerificationTest[] }>): VerificationSuite {
    if (!input || typeof input !== "object" || !Array.isArray(input.tests)) {
        throw new TypeError("Verification suite must declare a tests array");
    }
    return Object.freeze({ tests: Object.freeze([...input.tests]) });
}

export function test(name: string, execute: VerificationTest["execute"]): VerificationTest {
    if (typeof name !== "string" || name.length === 0 || utf8ByteLength(name) > 256) {
        throw new TypeError("Verification test name must be non-empty and bounded");
    }
    if (typeof execute !== "function") {
        throw new TypeError("Verification test body must be a function");
    }
    return Object.freeze({ name, execute });
}

function utf8ByteLength(value: string): number {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
        const first = value.charCodeAt(index);
        if (first <= 0x7f) {
            bytes += 1;
        } else if (first <= 0x7ff) {
            bytes += 2;
        } else if (first >= 0xd800 && first <= 0xdbff) {
            const second = value.charCodeAt(index + 1);
            if (second < 0xdc00 || second > 0xdfff) {
                throw new TypeError("Verification test names must contain valid Unicode");
            }
            bytes += 4;
            index += 1;
        } else if (first >= 0xdc00 && first <= 0xdfff) {
            throw new TypeError("Verification test names must contain valid Unicode");
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

export function assert(condition: unknown, message = "Verification assertion failed"): asserts condition {
    if (!condition) {
        throw new VerificationAssertionError(message);
    }
}

export function expect(actual: unknown) {
    return Object.freeze({
        toBe(expected: unknown): void {
            if (!Object.is(actual, expected)) {
                throw new VerificationAssertionError("Expected values to be identical");
            }
        },
        toEqual(expected: unknown): void {
            if (canonicalValue(actual) !== canonicalValue(expected)) {
                throw new VerificationAssertionError("Expected values to be deeply equal");
            }
        },
        toHaveLength(expected: number): void {
            if (!Number.isSafeInteger(expected) || expected < 0 || lengthOf(actual) !== expected) {
                throw new VerificationAssertionError(`Expected value to have length ${expected}`);
            }
        },
    });
}

export class VerificationAssertionError extends Error {
    override readonly name = "VerificationAssertionError";
}

function canonicalValue(value: unknown): string {
    assertSerializable(value, new Set());
    return JSON.stringify(sortValue(value));
}

function assertSerializable(value: unknown, seen: Set<object>): void {
    if (value === null || ["boolean", "number", "string"].includes(typeof value)) {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new TypeError("Verification values must contain finite numbers");
        }
        return;
    }
    if (typeof value !== "object" || seen.has(value as object)) {
        throw new TypeError("Verification values must be acyclic JSON values");
    }
    seen.add(value as object);
    const entries = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    for (const entry of entries) {
        assertSerializable(entry, seen);
    }
    seen.delete(value as object);
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
                .map(([key, entry]) => [key, sortValue(entry)]),
        );
    }
    return value;
}

function lengthOf(value: unknown): number | undefined {
    return typeof value === "string" || Array.isArray(value) ? value.length : undefined;
}
