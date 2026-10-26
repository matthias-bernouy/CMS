export type Check = (value: unknown) => void;
export const text: Check = (value) => {
    if (typeof value !== "string" || value.length > 1024 * 1024 || !value.isWellFormed()) {
        throw new TypeError("Content delivery expected bounded text");
    }
};
export const flag: Check = (value) => {
    if (typeof value !== "boolean") {
        throw new TypeError("Content delivery expected a boolean");
    }
};
export const integer: Check = (value) => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new TypeError("Content delivery expected a nonnegative integer");
    }
};
export const revision: Check = (value) => {
    if (typeof value === "string" && value.length > 0 && value.length <= 4096) {
        return;
    }
    integer(value);
};
export function literal(...allowed: readonly unknown[]): Check {
    return (value) => {
        if (!allowed.includes(value)) {
            throw new TypeError("Content delivery returned an invalid discriminator");
        }
    };
}
export function optional(check: Check): Check {
    return (value) => {
        if (value !== undefined) {
            check(value);
        }
    };
}
export function nullable(check: Check): Check {
    return (value) => {
        if (value !== null) {
            check(value);
        }
    };
}
export function array(check: Check, maximum = 10_000): Check {
    return (value) => {
        if (!Array.isArray(value) || value.length > maximum) {
            throw new TypeError("Content delivery expected a bounded array");
        }
        for (let index = 0; index < value.length; index++) {
            if (!Object.hasOwn(value, index)) {
                throw new TypeError("Content delivery returned a sparse array");
            }
            check(value[index]);
        }
    };
}
export function record(check: Check): Check {
    return (value) => {
        object(value);
        if (Object.keys(value).length > 10_000) {
            throw new TypeError("Content delivery map is too large");
        }
        for (const [key, item] of Object.entries(value)) {
            text(key);
            check(item);
        }
    };
}
function object(value: unknown): asserts value is Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    ) {
        throw new TypeError("Content delivery expected an object");
    }
}
export function fields(shape: Readonly<Record<string, Check>>): Check {
    return (value) => {
        object(value);
        for (const key of Object.keys(value)) {
            if (!Object.hasOwn(shape, key)) {
                throw new TypeError(`Content delivery returned unknown field ${key}`);
            }
        }
        for (const [key, check] of Object.entries(shape)) {
            try {
                check(Object.hasOwn(value, key) ? value[key] : undefined);
            } catch (error) {
                throw new TypeError(`Invalid content delivery field ${key}`, { cause: error });
            }
        }
    };
}
export function variant(discriminator: string, variants: Readonly<Record<string, Check>>): Check {
    return (value) => {
        object(value);
        const tag = value[discriminator];
        if (typeof tag !== "string" || !Object.hasOwn(variants, tag)) {
            throw new TypeError(`Invalid content delivery ${discriminator}`);
        }
        variants[tag]!(value);
    };
}
