import { test, expect } from "bun:test";
import { isVisible } from "src/core/tenantConfig/isVisible";

const schema = {
    properties: {
        carriers: { type: "array" },
        mode:     { type: "string" },
        region:   { type: "string" },
        contractRef: {
            type: "string",
            "x-visible-if": { carriers: { contains: "mondial-relay" } },
        },
        eqField: {
            type: "string",
            "x-visible-if": { mode: "advanced" },
        },
        inField: {
            type: "string",
            "x-visible-if": { region: { in: ["FR", "BE"] } },
        },
        truthyField: {
            type: "string",
            "x-visible-if": { mode: { truthy: true } },
        },
        andField: {
            type: "string",
            "x-visible-if": {
                carriers: { contains: "mondial-relay" },
                mode:     "advanced",
            },
        },
        bogusField: {
            type: "string",
            "x-visible-if": { mode: { unknown_op: 1 } },
        },
        always: { type: "string" },                       // no x-visible-if
    },
};

test("no x-visible-if → always visible", () => {
    expect(isVisible("always", {}, schema)).toBe(true);
});

test("bare value: equality match", () => {
    expect(isVisible("eqField", { mode: "advanced" }, schema)).toBe(true);
    expect(isVisible("eqField", { mode: "basic" },    schema)).toBe(false);
    expect(isVisible("eqField", {},                   schema)).toBe(false);
});

test("contains: array.includes", () => {
    expect(isVisible("contractRef", { carriers: ["mondial-relay", "colissimo"] }, schema)).toBe(true);
    expect(isVisible("contractRef", { carriers: ["colissimo"] },                  schema)).toBe(false);
    expect(isVisible("contractRef", { carriers: [] },                             schema)).toBe(false);
    expect(isVisible("contractRef", {},                                            schema)).toBe(false);
});

test("contains: string.includes (substring)", () => {
    const s = { properties: { name: { type: "string" }, x: { type: "string",
        "x-visible-if": { name: { contains: "admin" } } } } };
    expect(isVisible("x", { name: "site-admin" }, s)).toBe(true);
    expect(isVisible("x", { name: "site-user" },  s)).toBe(false);
});

test("in: enum membership", () => {
    expect(isVisible("inField", { region: "FR" }, schema)).toBe(true);
    expect(isVisible("inField", { region: "BE" }, schema)).toBe(true);
    expect(isVisible("inField", { region: "DE" }, schema)).toBe(false);
});

test("truthy: presence", () => {
    expect(isVisible("truthyField", { mode: "x" }, schema)).toBe(true);
    expect(isVisible("truthyField", { mode: "" },  schema)).toBe(false);
    expect(isVisible("truthyField", {},            schema)).toBe(false);

    const s2 = { properties: { mode: { type: "string" }, x: { type: "string",
        "x-visible-if": { mode: { truthy: false } } } } };
    expect(isVisible("x", { mode: "" }, s2)).toBe(true);
});

test("AND across keys", () => {
    expect(isVisible("andField",
        { carriers: ["mondial-relay"], mode: "advanced" }, schema)).toBe(true);
    expect(isVisible("andField",
        { carriers: ["mondial-relay"], mode: "basic" },    schema)).toBe(false);
    expect(isVisible("andField",
        { carriers: ["colissimo"], mode: "advanced" },     schema)).toBe(false);
});

test("unknown operator → fail closed (hide)", () => {
    expect(isVisible("bogusField", { mode: 1 }, schema)).toBe(false);
});

test("unknown field name → visible by default (no clause)", () => {
    expect(isVisible("ghostField", {}, schema)).toBe(true);
});
