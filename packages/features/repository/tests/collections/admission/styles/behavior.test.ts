import { expect, test } from "bun:test";
import { parseCollectionRelease } from "repository/collections/core/parsing/parseCollectionRelease";
import { validateBloc } from "repository/collections/tooling/validateBloc";
import { colorCollection } from "./fixture";

const style = `:scope { --atlas-dofficial--atlas--panel-tone: var(--atlas-dofficial--atlas--accent);
    --atlas-dofficial--atlas--panel-alias: var(--atlas-dofficial--atlas--panel-tone); color: var(--atlas-dofficial--atlas--panel-alias);
    transform: translateX(var(--atlas-dofficial--atlas--panel-offset, 0px)); }`;

test.each([
    'document.createElement("style")',
    'sheet.insertRule(":scope { color: red; }")',
    'root.setAttribute("fill", color)',
    'root.style?.setProperty("background", "red")',
    'root.style.setProperty?.("background", "red")',
    'root.style["setProperty"]("background", "red")',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-unused", "red")',
    'root.style.color = "red"',
    "root.style.backgroundColor = color",
    'root["style"]["fill"] = color',
    "root.style.cssText = value",
    'root.setAttribute("style", value)',
    "Object.assign(root.style, values)",
    'root.style.setProperty("background", "red")',
    'root.style.setProperty(name, "red")',
])("rejects direct styling in sources and compiled artifacts: %s", (write) => {
    expect(
        validateBloc({ tag: "atlas-dofficial--atlas--panel", viewSource: `export function mount(root) { ${write}; }` })
            .errors.length,
    ).toBeGreaterThan(0);
    expect(() => parseCollectionRelease(colorCollection(style, `function run(root) { ${write}; }`))).toThrow(
        /style|theme token/,
    );
});

test("keeps dynamic border geometry separate from paint inputs", () => {
    const geometry =
        ":scope { border-width: var(--atlas-dofficial--atlas--panel-width, 1px); border-color: var(--atlas-dofficial--atlas--accent); }";
    expect(() =>
        parseCollectionRelease(
            colorCollection(
                geometry,
                'function run(root, width) { root.style.setProperty("--atlas-dofficial--atlas--panel-width", width); }',
            ),
        ),
    ).not.toThrow();
});

test.each([
    ["example/brand", "example--brand--card"],
    ["example/atlas-panel", "example--atlas-panel--card"],
])("checks runtime writes to imported Bloc %s inputs even without their stylesheet", (collectionId, tag) => {
    const source = colorCollection(
        ":scope { display: block; }",
        `function run(root, value) { root.style.setProperty("--${tag}-tone", value); }`,
    );
    source.dependencies = [
        {
            collectionId,
            publisherId: "example",
            versionRange: "^1.0.0",
            imports: { blocs: [{ id: tag }] },
        },
    ];
    source.blocs[0].uses = [tag];
    expect(() => parseCollectionRelease(source)).toThrow(/static theme-token reference/);
    source.blocs[0].runtime.viewJS = `function run(root) { root.style.setProperty("--${tag}-tone", "var(--atlas-dofficial--atlas--accent)"); }`;
    expect(() => parseCollectionRelease(source)).not.toThrow();
});

test.each([
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", "red")',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", value)',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", "var(--atlas-dofficial--atlas--panel-offset)")',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-alias", "var(--atlas-dofficial--atlas--accent,#fff)")',
    'root.style.setProperty("--atlas-dofficial--atlas--accent", "currentColor")',
    'root.style.setProperty("--foreign-tone", "red")',
])("rechecks color input writes against the full CSS graph: %s", (write) => {
    expect(() => parseCollectionRelease(colorCollection(style, `function run(root, value) { ${write}; }`))).toThrow();
});

test.each([
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", "var(--atlas-dofficial--atlas--accent)")',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-offset", value)',
    "root.style.width = value",
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", "color-mix(in srgb, var(--atlas-dofficial--atlas--accent) 30%, transparent)")',
    'root.style.setProperty("--atlas-dofficial--atlas--panel-tone", "currentColor")',
    'const canvas = document.createElement("canvas"); canvas.getContext("2d").fillStyle = value',
])("preserves token selection, geometry and canvas data previews: %s", (write) => {
    expect(() =>
        parseCollectionRelease(colorCollection(style, `function run(root, value) { ${write}; }`)),
    ).not.toThrow();
});
