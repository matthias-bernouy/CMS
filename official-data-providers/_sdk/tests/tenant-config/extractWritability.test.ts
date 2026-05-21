import { test, expect } from "bun:test";
import { extractWritability } from "src/core/tenantConfig/extractWritability";

test("default global is [control-plane, tenant] when absent", () => {
    const w = extractWritability({
        properties: { a: { type: "string" }, b: { type: "integer" } },
    });
    expect(w["a"]).toEqual(["control-plane", "tenant"]);
    expect(w["b"]).toEqual(["control-plane", "tenant"]);
});

test("root defaultWritableBy is honored", () => {
    const w = extractWritability({
        defaultWritableBy: ["control-plane"],
        properties: { a: { type: "string" }, b: { type: "integer" } },
    });
    expect(w["a"]).toEqual(["control-plane"]);
    expect(w["b"]).toEqual(["control-plane"]);
});

test("per-field x-writable-by overrides root default", () => {
    const w = extractWritability({
        defaultWritableBy: ["control-plane", "tenant"],
        properties: {
            cosmetic:    { type: "string" },                                       // inherits
            contractRef: { type: "string", "x-writable-by": ["control-plane"] },   // hub-only
        },
    });
    expect(w["cosmetic"]).toEqual(["control-plane", "tenant"]);
    expect(w["contractRef"]).toEqual(["control-plane"]);
});

test("invalid role strings in x-writable-by are filtered out", () => {
    const w = extractWritability({
        properties: { x: { type: "string", "x-writable-by": ["control-plane", "bogus"] } },
    });
    expect(w["x"]).toEqual(["control-plane"]);
});

test("schema without properties returns empty map", () => {
    expect(extractWritability({})).toEqual({});
    expect(extractWritability({ type: "object" })).toEqual({});
});
