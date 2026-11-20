import { expect, test } from "bun:test";
import { parse, walk } from "css-tree";
import { compileBlocStyle } from "repository/collections/core/validation/styles/compile";

const id = "example--atlas--panel";
const frames = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";

test("refuses name expansion beyond the renderable stylesheet budget before emitting CSS", () => {
    const names = Array(5000).fill("fade").join(",");
    expect(() => compileBlocStyle(id, `${frames} :scope { animation-name: ${names}; }`)).toThrow(
        /stylesheet length limit/,
    );
});

test.each([
    "animation: var(--name) 1s",
    "animation-name: var(--name, fade)",
    "animation: fade var(--duration)",
    "animation: fade 1s steps(var(--steps), end)",
    "animation: fade 1s, var(--second)",
    String.raw`animation-name: v\61 r(--name)`,
    String.raw`an\69mation: var(--value)`,
    "-webkit-animation-name: var(--name)",
    "animation-name: attr(data-animation)",
    "animation: fade env(duration)",
])("refuses dynamic animation values explicitly: %s", (declaration) => {
    expect(() => compileBlocStyle(id, `${frames} :scope { ${declaration}; }`)).toThrow(/static animation names/);
});

test.each([
    "animation: unknown 1s",
    "animation-name: fade, unknown",
    "animation: fade 1s, unknown 2s",
    "animation-name: Fade",
    "-webkit-animation: unknown 1s",
    "-moz-animation-name: unknown",
    String.raw`animation-name: \75 nknown`,
    'animation-name: "unknown"',
])("refuses every unknown local reference: %s", (declaration) => {
    expect(() => compileBlocStyle(id, `${frames} :scope { ${declaration}; }`)).toThrow(/unknown local animation/);
});

test.each([
    "@keyframes {}",
    "@keyframes fade;",
    "@keyframes fade unknown {}",
    "@keyframes var(--name) {}",
    "@keyframes none {}",
    "@keyframes NONE {}",
    "@keyframes initial {}",
    String.raw`@keyframes \69nitial {}`,
])("refuses invalid keyframes declarations: %s", (source) => {
    expect(() => compileBlocStyle(id, source)).toThrow(/@keyframes/);
});

test.each([
    "animation: fade 1s 2s 3s",
    "animation-name: fade,",
    "animation-name: 1s",
    "animation: fade ???",
    "animation: initial, fade 1s",
    "animation-name: fade, inherit",
    "animation-name: ,fade",
])("refuses invalid animation grammar: %s", (declaration) => {
    expect(() => compileBlocStyle(id, `${frames} :scope { ${declaration}; }`)).toThrow(/invalid animation/);
});

test("cannot reference or overwrite another Bloc's compiled animation name", () => {
    const foreignCss = compileBlocStyle("other--atlas--panel", frames);
    let foreign = "";
    walk(parse(foreignCss), (node) => {
        if (node.type === "Atrule" && node.name === "keyframes" && node.prelude?.type === "AtrulePrelude") {
            const name = node.prelude.children.first!;
            if (name.type === "Identifier") {
                foreign = name.name;
            }
        }
    });
    expect(foreign).not.toBe("");
    expect(() => compileBlocStyle(id, `:scope { animation-name: ${foreign}; }`)).toThrow(/unknown local animation/);
    const attemptedOverride = compileBlocStyle(id, `@keyframes ${foreign} { to { opacity: 0; } }`);
    expect(attemptedOverride).not.toContain(`@keyframes ${foreign} `);
    expect(compileBlocStyle("other--atlas--panel", frames)).toBe(foreignCss);
});

test.each([
    '@import url("https://other.test/style.css");',
    "@scope (body) {}",
    "@property --foreign {}",
    '@keyframes fade { to { background: url("https://other.test/a.png"); } }',
    '[cms-bloc="other--atlas--panel"] { animation-name: fade; }',
    "body { animation-name: fade; }",
    ":root { animation-name: fade; }",
])("retains existing URL and Bloc boundary refusals with animations: %s", (source) => {
    expect(() => compileBlocStyle(id, `${frames} ${source}`)).toThrow();
});

test.each([
    ":scope {} } } .outside { opacity: 0; }",
    "@keyframes fade {} } } @keyframes foreign {}",
    "@keyframes fade { to { opacity: 1; }",
    ":scope { animation: fade 1s; transform: translateX(1px; }",
    ":scope[hidden { animation-name: fade; }",
    "@keyframes fade {} /*",
    '"unterminated',
    String.raw`"escaped closing quote\"`,
    "url({{cms.asset.example/atlas.icons/check.svg}}",
])("parser recovery cannot escape the generated Bloc boundary: %s", (source) => {
    expect(() => compileBlocStyle(id, source)).toThrow(/balanced delimiters/);
});
