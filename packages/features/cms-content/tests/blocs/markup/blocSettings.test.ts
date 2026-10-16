import { expect, test } from "bun:test";
import { assertBlocSettingAttributes } from "cms-content/blocs/core/markup/validation/contracts/settings";

const configured = [
    {
        id: "example-counter",
        root: { accepts: ["div"] },
        settings: [
            {
                id: "count",
                label: "Count",
                type: "integer" as const,
                default: 3,
                minimum: 1,
                maximum: 6,
                control: { kind: "number" as const, step: 1 },
            },
            {
                id: "ratio",
                label: "Ratio",
                type: "number" as const,
                default: 0.5,
                minimum: 0,
                maximum: 1,
                control: { kind: "range" as const, step: 0.1 },
            },
            {
                id: "compact",
                label: "Compact",
                type: "boolean" as const,
                default: false,
                control: { kind: "toggle" as const },
            },
        ],
    },
];

test("collection number attributes use strict JSON syntax before schema validation", () => {
    expect(() =>
        assertBlocSettingAttributes(
            '<div cms-bloc=\"example-counter\" count="3" ratio="5e-1" compact></div>',
            configured,
        ),
    ).not.toThrow();

    for (const value of ["", "01", "0x2", "NaN", "Infinity", " 3 "]) {
        expect(() =>
            assertBlocSettingAttributes(
                `<div cms-bloc=\"example-counter\" count="${value}" ratio="0.5"></div>`,
                configured,
            ),
        ).toThrow("must use JSON number syntax");
    }
});

test("collection number attributes enforce explicit values and accept absent attributes through defaults", () => {
    expect(() =>
        assertBlocSettingAttributes('<div cms-bloc=\"example-counter\" count="1.5" ratio="0.5"></div>', configured),
    ).toThrow("safe integer");
    expect(() =>
        assertBlocSettingAttributes('<div cms-bloc=\"example-counter\" count="7" ratio="0.5"></div>', configured),
    ).toThrow("at most 6");
    expect(() =>
        assertBlocSettingAttributes('<div cms-bloc=\"example-counter\" count="3" ratio="2"></div>', configured),
    ).toThrow("at most 1");
    expect(() =>
        assertBlocSettingAttributes('<div cms-bloc=\"example-counter\" ratio="0.5"></div>', configured),
    ).not.toThrow();
});

test("collection settings reject undeclared host attributes", () => {
    expect(() =>
        assertBlocSettingAttributes(
            '<div cms-bloc=\"example-counter\" count="3" ratio="0.5" mystery="value"></div>',
            configured,
        ),
    ).toThrow("neither a declared setting nor a native root attribute");
});
