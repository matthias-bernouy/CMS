import { expect, test } from "bun:test";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import { colorCollection } from "./fixture";

test.each([
    "--atlas-panel-unused-palette: red",
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
    "background: color-mix(in srgb, var(--atlas-accent), #fff)",
    "color: var(--atlas-accent, #fff)",
    "--atlas-panel-b: #fff; --atlas-panel-a: var(--atlas-panel-b); color: var(--atlas-panel-a)",
    "--atlas-panel-hue: 120; color: hsl(var(--atlas-panel-hue) 100% 50%)",
    String.raw`co\6cor: r\65 d`,
    String.raw`color: r\67 b(1 2 3)`,
    "color: attr(data-color type(<color>))",
])("rejects raw paint at admission: %s", (declarations) => {
    expect(() => parseCollectionRelease(colorCollection(`:scope { ${declarations}; }`))).toThrow(/theme token/);
});

test.each([
    "color: rgb(from var(--atlas-accent) r g b / .5)",
    "color: var(--atlas-accent)",
    "color: currentColor",
    "background: transparent",
    "border: none",
    "color: inherit",
    "background: none",
    "box-shadow: none",
    "color: revert-layer",
    "background: color-mix(in srgb, var(--atlas-accent) 25%, transparent)",
    "--atlas-panel-tone: var(--atlas-accent); color: var(--atlas-panel-tone)",
    "--atlas-panel-b: var(--atlas-accent); --atlas-panel-a: var(--atlas-panel-b); color: var(--atlas-panel-a)",
    "border: 1px solid currentColor; padding: 1rem; opacity: .5",
    "background: var(--atlas-panel-background, transparent)",
])("accepts theme paint and unchanged geometry: %s", (declarations) => {
    expect(() => parseCollectionRelease(colorCollection(`:scope { ${declarations}; }`))).not.toThrow();
});

test("checks every alias variant, prevents cycles, token overrides and CSS registrations", () => {
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope {
        --atlas-panel-a: var(--atlas-panel-b); --atlas-panel-b: var(--atlas-panel-a);
        color: var(--atlas-panel-a);
    }`),
        ),
    ).toThrow(/cyclic UI color alias/);
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope {
        --atlas-panel-a: var(--atlas-accent); color: var(--atlas-panel-a);
    } :scope:hover { --atlas-panel-a: #fff; }`),
        ),
    ).toThrow(/raw or unverified color/);
    expect(() => parseCollectionRelease(colorCollection(":scope { --atlas-accent: currentColor; }"))).toThrow(
        /cannot redefine theme token/,
    );
    expect(() =>
        parseCollectionRelease(
            colorCollection('@property --atlas-panel-a { syntax: "<color>"; initial-value: red; inherits: true; }'),
        ),
    ).toThrow(/cannot declare @property/);
});

test("resolves long local color chains without recursive graph traversal", () => {
    const aliases = Array.from(
        { length: 1000 },
        (_, index) => `--atlas-panel-a${index}: var(--atlas-panel-a${index + 1});`,
    ).join("");
    expect(() =>
        parseCollectionRelease(
            colorCollection(`:scope { ${aliases}
        --atlas-panel-a1000: var(--atlas-accent); color: var(--atlas-panel-a0);
    }`),
        ),
    ).not.toThrow();
});
