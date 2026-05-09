import type { ProxyAuth } from "../../interfaces/entities/BucketProxy";

/**
 * Wire-shape validator for `ProxyAuth`. Shared between the admin and
 * broker surface handlers so the contract stays in one place. Throws
 * `TypeError` on any deviation; `wrapAdmin` maps that to a 400.
 */
export function parseProxyAuth(value: unknown): ProxyAuth {
    if (value === undefined || value === null) return { type: "none" };
    if (typeof value !== "object") throw new TypeError("'auth' must be an object.");
    const obj = value as Record<string, unknown>;
    if (obj.type === "none")   return { type: "none" };
    if (obj.type === "bearer") {
        if (typeof obj.token !== "string") throw new TypeError("'auth.token' must be a string.");
        return { type: "bearer", token: obj.token };
    }
    if (obj.type === "headers") {
        if (!Array.isArray(obj.headers)) throw new TypeError("'auth.headers' must be an array.");
        const headers = obj.headers.map((h, i) => {
            if (typeof h !== "object" || h === null) throw new TypeError(`'auth.headers[${i}]' must be an object.`);
            const entry = h as Record<string, unknown>;
            if (typeof entry.name  !== "string") throw new TypeError(`'auth.headers[${i}].name' must be a string.`);
            if (typeof entry.value !== "string") throw new TypeError(`'auth.headers[${i}].value' must be a string.`);
            return { name: entry.name, value: entry.value };
        });
        return { type: "headers", headers };
    }
    throw new TypeError(`Unsupported auth.type "${String(obj.type)}".`);
}
