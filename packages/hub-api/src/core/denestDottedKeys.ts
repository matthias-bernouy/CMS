/** Take `{ "a.b": 1, "a.c": 2, d: 3 }` → `{ a: { b: 1, c: 2 }, d: 3 }`.
 *  Used to deserialize HTML form bodies whose nested fields come as dotted
 *  keys (the `<w13c-form>` + `<p9r-input name="a.b">` pattern). */
export function isPlainObject(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

const FORBIDDEN_SEGMENT = new Set(["__proto__", "constructor", "prototype"]);

export function denestDottedKeys(flat: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(flat)) {
        if (!key.includes(".")) {
            if (FORBIDDEN_SEGMENT.has(key)) continue;   // prototype-pollution guard
            out[key] = val; continue;
        }
        const parts = key.split(".");
        if (parts.some((p) => FORBIDDEN_SEGMENT.has(p))) continue;   // prototype-pollution guard
        let cur = out;
        for (let i = 0; i < parts.length - 1; i++) {
            const seg = parts[i]!;
            if (!isPlainObject(cur[seg])) cur[seg] = {};
            cur = cur[seg] as Record<string, unknown>;
        }
        cur[parts[parts.length - 1]!] = val;
    }
    return out;
}
