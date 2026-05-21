import { test, expect } from "bun:test";
import { assertTenantWritable } from "src/core/tenantConfig/filterWritable";
import { PlaneError } from "src/core/errors";

const schema = {
    defaultWritableBy: ["control-plane", "tenant"],
    properties: {
        carriers:    { type: "array" },
        countries:   { type: "array" },
        contractRef: { type: "string", "x-writable-by": ["control-plane"] },
    },
};

test("tenant-writable fields pass through (no throw)", () => {
    expect(() => assertTenantWritable(schema, { carriers: ["mr"], countries: ["FR"] })).not.toThrow();
});

test("hub-only field rejected with PlaneError (403 mapping)", () => {
    expect(() => assertTenantWritable(schema, { contractRef: "MR-42" })).toThrow(PlaneError);
});

test("mixed body — even one forbidden field throws (no silent strip)", () => {
    expect(() => assertTenantWritable(schema, { carriers: ["mr"], contractRef: "MR-42" })).toThrow(PlaneError);
});

test("unknown field rejected with PlaneError", () => {
    expect(() => assertTenantWritable(schema, { surprise: 1 })).toThrow(PlaneError);
});

test("empty body is a no-op", () => {
    expect(() => assertTenantWritable(schema, {})).not.toThrow();
});
