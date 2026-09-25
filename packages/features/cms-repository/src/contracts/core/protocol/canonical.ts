import canonicalize from "canonicalize";
import { ReleaseValidationError } from "./errors";

const encoder = new TextEncoder();

type ValueFrame = { kind: "value"; value: unknown; path: string; depth: number };
type LeaveFrame = { kind: "leave"; value: object };
type ValidationFrame = LeaveFrame | ValueFrame;

function assertUnicode(value: string, path: string): void {
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            const trailing = value.charCodeAt(index + 1);
            if (!(trailing >= 0xdc00 && trailing <= 0xdfff)) {
                throw new ReleaseValidationError("invalid_contract", "contains an isolated high surrogate", path);
            }
            index += 1;
        } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            throw new ReleaseValidationError("invalid_contract", "contains an isolated low surrogate", path);
        }
    }
}

function childFrames(value: object, path: string, depth: number): ValueFrame[] {
    if (Array.isArray(value)) {
        const keys = Object.keys(value);
        if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
            throw new ReleaseValidationError("invalid_contract", "must not be sparse or have extra properties", path);
        }
        return value.map((child, index) => ({ kind: "value", value: child, path: `${path}[${index}]`, depth }));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new ReleaseValidationError("invalid_contract", "must be a plain object", path);
    }
    return Reflect.ownKeys(value).map((key) => {
        if (typeof key !== "string") {
            throw new ReleaseValidationError("invalid_contract", "contains a symbol property", path);
        }
        assertUnicode(key, `${path} property name`);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
            throw new ReleaseValidationError("invalid_contract", "must contain only enumerable data properties", path);
        }
        return { kind: "value", value: descriptor.value, path: `${path}.${key}`, depth };
    });
}

export function assertIJson(value: unknown, maxDepth = 64): void {
    if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) {
        throw new TypeError("I-JSON depth limit must be a positive safe integer");
    }
    const ancestors = new Set<object>();
    const stack: ValidationFrame[] = [{ kind: "value", value, path: "$", depth: 0 }];
    while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) {
            break;
        }
        if (frame.kind === "leave") {
            ancestors.delete(frame.value);
            continue;
        }
        if (frame.value === null || typeof frame.value === "boolean") {
            continue;
        }
        if (typeof frame.value === "string") {
            assertUnicode(frame.value, frame.path);
            continue;
        }
        if (typeof frame.value === "number") {
            if (
                !Number.isFinite(frame.value) ||
                (Number.isInteger(frame.value) && !Number.isSafeInteger(frame.value))
            ) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "must be a finite interoperable number",
                    frame.path,
                );
            }
            continue;
        }
        if (typeof frame.value !== "object") {
            throw new ReleaseValidationError(
                "invalid_contract",
                `has unsupported type ${typeof frame.value}`,
                frame.path,
            );
        }
        if (frame.depth >= maxDepth) {
            throw new ReleaseValidationError(
                "json_depth_limit_exceeded",
                `exceeds nesting depth ${maxDepth}`,
                frame.path,
            );
        }
        if (ancestors.has(frame.value)) {
            throw new ReleaseValidationError("invalid_contract", "contains a circular reference", frame.path);
        }
        ancestors.add(frame.value);
        stack.push({ kind: "leave", value: frame.value });
        const children = childFrames(frame.value, frame.path, frame.depth + 1);
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]!);
        }
    }
}

export function canonicalizeIJson(value: unknown, maxDepth = 64): string {
    assertIJson(value, maxDepth);
    const result = canonicalize(value);
    if (result === undefined) {
        throw new ReleaseValidationError("invalid_contract", "cannot be serialized as canonical JSON");
    }
    return result;
}

export function canonicalIJsonBytes(value: unknown, maxDepth = 64): Uint8Array {
    return encoder.encode(canonicalizeIJson(value, maxDepth));
}
