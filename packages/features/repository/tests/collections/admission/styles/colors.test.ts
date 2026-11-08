import { expect, test } from "bun:test";
import { parseCollectionRelease } from "repository/collections/core/parsing/parseCollectionRelease";
import { colorCollection } from "./fixture";

test.each([
    "--atlas-dofficial--atlas--panel-unused-palette: red",
    "color: #fff",
    "background-color: red",
    "background: Canvas",
    "color: rebeccapurple",
    "border: 1px solid rgb(1 2 3 / 40%)",
    "outline: 2px solid hsl(20 40% 60%)",
    "box-shadow: 0 1px 4px #0008",
    "text-shadow: 0 1px blue",
    "fill: oklch(60% .1 120)",
    "stroke: lab(50 10 20)",
    "text-decoration: underline red",
    "text-emphasis: red",
    "caret-color: red",
    "accent-color: blue",
    "scrollbar-color: red blue",
    "column-rule: 1px solid red",
    "filter: drop-shadow(0 1px 2px #fff)",
    "background-image: linear-gradient(red, transparent)",
    "background: color-mix(in srgb, var(--atlas-dofficial--atlas--accent), #fff)",
    "color: var(--atlas-dofficial--atlas--accent, #fff)",
    "--atlas-dofficial--atlas--panel-b: #fff; --atlas-dofficial--atlas--panel-a: var(--atlas-dofficial--atlas--panel-b); color: var(--atlas-dofficial--atlas--panel-a)",
    "--atlas-dofficial--atlas--panel-hue: 120; color: hsl(var(--atlas-dofficial--atlas--panel-hue) 100% 50%)",
    String.raw`co\6cor: r\65 d`,
    String.raw`color: r\67 b(1 2 3)`,
    "color: attr(data-color type(<color>))",
])("rejects raw paint at admission: %s", (declarations) => {
    expect(() => parseCollectionRelease(colorCollection(`:scope { ${declarations}; }`))).toThrow(/theme token/);
});

test.each([
    "color: rgb(from var(--atlas-dofficial--atlas--accent) r g b / .5)",
    "color: var(--atlas-dofficial--atlas--accent)",
    "color: currentColor",
    "background: transparent",
    "border: none",
    "color: inherit",
    "background: none",
    "box-shadow: none",
    "color: revert-layer",
    "background: color-mix(in srgb, var(--atlas-dofficial--atlas--accent) 25%, transparent)",
    "--atlas-dofficial--atlas--panel-tone: var(--atlas-dofficial--atlas--accent); color: var(--atlas-dofficial--atlas--panel-tone)",
    "--atlas-dofficial--atlas--panel-b: var(--atlas-dofficial--atlas--accent); --atlas-dofficial--atlas--panel-a: var(--atlas-dofficial--atlas--panel-b); color: var(--atlas-dofficial--atlas--panel-a)",
    "border: 1px solid currentColor; padding: 1rem; opacity: .5",
    "background: var(--atlas-dofficial--atlas--panel-background, transparent)",
])("accepts theme paint and unchanged geometry: %s", (declarations) => {
    expect(() => parseCollectionRelease(colorCollection(`:scope { ${declarations}; }`))).not.toThrow();
});

test("checks every alias variant, prevents cycles, token overrides and CSS registrations", () => {
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope {
        --atlas-dofficial--atlas--panel-a: var(--atlas-dofficial--atlas--panel-b); --atlas-dofficial--atlas--panel-b: var(--atlas-dofficial--atlas--panel-a);
        color: var(--atlas-dofficial--atlas--panel-a);
    }`),
        ),
    ).toThrow(/cyclic UI color alias/);
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope {
        --atlas-dofficial--atlas--panel-a: var(--atlas-dofficial--atlas--accent); color: var(--atlas-dofficial--atlas--panel-a);
    } :scope:hover { --atlas-dofficial--atlas--panel-a: #fff; }`),
        ),
    ).toThrow(/raw or unverified color/);
    expect(() =>
        parseCollectionRelease(colorCollection(":scope { --atlas-dofficial--atlas--accent: currentColor; }")),
    ).toThrow(/cannot redefine theme token/);
    expect(() =>
        parseCollectionRelease(
            colorCollection(
                '@property --atlas-dofficial--atlas--panel-a { syntax: "<color>"; initial-value: red; inherits: true; }',
            ),
        ),
    ).toThrow(/cannot declare @property/);
});

test("resolves long local color chains without recursive graph traversal", () => {
    const aliases = Array.from(
        { length: 700 },
        (_, index) => `--atlas-dofficial--atlas--panel-a${index}: var(--atlas-dofficial--atlas--panel-a${index + 1});`,
    ).join("");
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope { ${aliases}
        --atlas-dofficial--atlas--panel-a700: var(--atlas-dofficial--atlas--accent); color: var(--atlas-dofficial--atlas--panel-a0);
    }`),
        ),
    ).not.toThrow();
});
