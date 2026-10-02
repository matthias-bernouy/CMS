import { expect, test } from "bun:test";
import { assertCollectionSettingAttributes } from "cms-content/blocs/core/markup/validation/collectionSettings";

const configured = [
    {
        id: "example-counter",
        collectionSettings: [
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
        assertCollectionSettingAttributes(
            '<example-counter count="3" ratio="5e-1" compact></example-counter>',
            configured,
        ),
    ).not.toThrow();

    for (const value of ["", "01", "0x2", "NaN", "Infinity", " 3 "]) {
        expect(() =>
            assertCollectionSettingAttributes(
                `<example-counter count="${value}" ratio="0.5"></example-counter>`,
                configured,
            ),
        ).toThrow("numeric attributes must use JSON number syntax");
    }
});

test("collection number attributes enforce numeric type, presence and bounds", () => {
    expect(() =>
        assertCollectionSettingAttributes('<example-counter count="1.5" ratio="0.5"></example-counter>', configured),
    ).toThrow("safe integer");
    expect(() =>
        assertCollectionSettingAttributes('<example-counter count="7" ratio="0.5"></example-counter>', configured),
    ).toThrow("at most 6");
    expect(() =>
        assertCollectionSettingAttributes('<example-counter count="3" ratio="2"></example-counter>', configured),
    ).toThrow("at most 1");
    expect(() =>
        assertCollectionSettingAttributes('<example-counter ratio="0.5"></example-counter>', configured),
    ).toThrow("required property");
});
