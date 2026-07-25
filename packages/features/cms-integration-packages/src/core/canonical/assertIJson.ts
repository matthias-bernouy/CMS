export class InvalidIJsonValueError extends TypeError {
    constructor(message: string) {
        super(`Invalid I-JSON value: ${message}`);
        this.name = "InvalidIJsonValueError";
    }
}

function assertValidUnicode(value: string, path: string): void {
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            const trailingCodeUnit = value.charCodeAt(index + 1);
            if (!(trailingCodeUnit >= 0xdc00 && trailingCodeUnit <= 0xdfff)) {
                throw new InvalidIJsonValueError(`${path} contains an isolated high surrogate`);
            }
            index += 1;
            continue;
        }
        if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            throw new InvalidIJsonValueError(`${path} contains an isolated low surrogate`);
        }
    }
}

function assertArray(value: unknown[], path: string, ancestors: Set<object>): void {
    const enumerableKeys = Object.keys(value);
    if (enumerableKeys.length !== value.length) {
        throw new InvalidIJsonValueError(`${path} must not contain sparse entries or extra properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        if (enumerableKeys[index] !== key) {
            throw new InvalidIJsonValueError(`${path} must not contain sparse entries or extra properties`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor)) {
            throw new InvalidIJsonValueError(`${path}[${key}] must be a data property`);
        }
        assertIJsonValueInternal(descriptor.value, `${path}[${key}]`, ancestors);
    }
    const allowedKeys = new Set<string>(["length", ...enumerableKeys]);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !allowedKeys.has(key)) {
            throw new InvalidIJsonValueError(`${path} contains a non-JSON property`);
        }
    }
}

function assertObject(value: object, path: string, ancestors: Set<object>): void {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidIJsonValueError(`${path} must be a plain object or array`);
    }
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") {
            throw new InvalidIJsonValueError(`${path} contains a symbol property`);
        }
        assertValidUnicode(key, `${path} property name`);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            throw new InvalidIJsonValueError(`${path}.${key} must be an enumerable data property`);
        }
        assertIJsonValueInternal(descriptor.value, `${path}.${key}`, ancestors);
    }
}

function assertIJsonValueInternal(value: unknown, path: string, ancestors: Set<object>): void {
    if (value === null || typeof value === "boolean") {
        return;
    }
    if (typeof value === "string") {
        assertValidUnicode(value, path);
        return;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new InvalidIJsonValueError(`${path} must be a finite number`);
        }
        return;
    }
    if (typeof value !== "object") {
        throw new InvalidIJsonValueError(`${path} has unsupported type ${typeof value}`);
    }
    if (ancestors.has(value)) {
        throw new InvalidIJsonValueError(`${path} contains a circular reference`);
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            assertArray(value, path, ancestors);
        } else {
            assertObject(value, path, ancestors);
        }
    } finally {
        ancestors.delete(value);
    }
}

export function assertIJsonValue(value: unknown): void {
    assertIJsonValueInternal(value, "$", new Set());
}
