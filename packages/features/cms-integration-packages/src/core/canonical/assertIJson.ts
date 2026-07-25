export type InvalidIJsonReason = "depth_limit_exceeded" | "invalid_unicode" | "invalid_value";

export const MAX_I_JSON_NESTING_DEPTH = 64;

export class InvalidIJsonValueError extends TypeError {
    readonly reason: InvalidIJsonReason;

    constructor(message: string, reason: InvalidIJsonReason = "invalid_value") {
        super(`Invalid I-JSON value: ${message}`);
        this.name = "InvalidIJsonValueError";
        this.reason = reason;
    }
}

function assertValidUnicode(value: string, path: string): void {
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            const trailingCodeUnit = value.charCodeAt(index + 1);
            if (!(trailingCodeUnit >= 0xdc00 && trailingCodeUnit <= 0xdfff)) {
                throw new InvalidIJsonValueError(`${path} contains an isolated high surrogate`, "invalid_unicode");
            }
            index += 1;
            continue;
        }
        if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            throw new InvalidIJsonValueError(`${path} contains an isolated low surrogate`, "invalid_unicode");
        }
    }
}

type ValueFrame = {
    kind: "value";
    value: unknown;
    path: string;
    depth: number;
};

type LeaveFrame = {
    kind: "leave";
    value: object;
};

type ValidationFrame = LeaveFrame | ValueFrame;

function arrayChildren(value: unknown[], path: string, depth: number): ValueFrame[] {
    const enumerableKeys = Object.keys(value);
    if (enumerableKeys.length !== value.length) {
        throw new InvalidIJsonValueError(`${path} must not contain sparse entries or extra properties`);
    }
    const children: ValueFrame[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        if (enumerableKeys[index] !== key) {
            throw new InvalidIJsonValueError(`${path} must not contain sparse entries or extra properties`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor)) {
            throw new InvalidIJsonValueError(`${path}[${key}] must be a data property`);
        }
        children.push({ kind: "value", value: descriptor.value, path: `${path}[${key}]`, depth });
    }
    const allowedKeys = new Set<string>(["length", ...enumerableKeys]);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !allowedKeys.has(key)) {
            throw new InvalidIJsonValueError(`${path} contains a non-JSON property`);
        }
    }
    return children;
}

function objectChildren(value: object, path: string, depth: number): ValueFrame[] {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidIJsonValueError(`${path} must be a plain object or array`);
    }
    const children: ValueFrame[] = [];
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") {
            throw new InvalidIJsonValueError(`${path} contains a symbol property`);
        }
        assertValidUnicode(key, `${path} property name`);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            throw new InvalidIJsonValueError(`${path}.${key} must be an enumerable data property`);
        }
        children.push({ kind: "value", value: descriptor.value, path: `${path}.${key}`, depth });
    }
    return children;
}

export function assertIJsonValue(value: unknown, maxDepth = MAX_I_JSON_NESTING_DEPTH): void {
    if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) {
        throw new TypeError("I-JSON maximum depth must be a positive safe integer");
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
            assertValidUnicode(frame.value, frame.path);
            continue;
        }
        if (typeof frame.value === "number") {
            if (!Number.isFinite(frame.value)) {
                throw new InvalidIJsonValueError(`${frame.path} must be a finite number`);
            }
            continue;
        }
        if (typeof frame.value !== "object") {
            throw new InvalidIJsonValueError(`${frame.path} has unsupported type ${typeof frame.value}`);
        }
        const containerDepth = frame.depth + 1;
        if (containerDepth > maxDepth) {
            throw new InvalidIJsonValueError(
                `${frame.path} exceeds maximum nesting depth ${maxDepth}`,
                "depth_limit_exceeded",
            );
        }
        if (ancestors.has(frame.value)) {
            throw new InvalidIJsonValueError(`${frame.path} contains a circular reference`);
        }
        ancestors.add(frame.value);
        stack.push({ kind: "leave", value: frame.value });
        const children = Array.isArray(frame.value)
            ? arrayChildren(frame.value, frame.path, containerDepth)
            : objectChildren(frame.value, frame.path, containerDepth);
        for (let index = children.length - 1; index >= 0; index -= 1) {
            const child = children[index];
            if (child) {
                stack.push(child);
            }
        }
    }
}
