import { expect, test } from "bun:test";
import { ident, parse, walk } from "css-tree";
import { compileBlocStyle } from "repository/collections/core/validation/styles/compile";

const id = "example--atlas--panel";
const frames = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";

function names(css: string): string[] {
    const result: string[] = [];
    walk(parse(css), (node) => {
        if (node.type === "Atrule" && node.name.endsWith("keyframes") && node.prelude?.type === "AtrulePrelude") {
            const name = node.prelude.children.first!;
            result.push(name.type === "Identifier" ? name.name : name.type === "String" ? name.value : "");
        }
    });
    return result;
}

test.each(["", " \n ", "/* animation: fade; */ :scope { display: grid; }", ":scope {\n  opacity: .5;\n}"])(
    "preserves historical compilation bytes without animations: %s",
    (style) => {
        expect(compileBlocStyle(id, style)).toBe(
            style.trim()
                ? `@layer ulvia.blocks {\n@scope ([cms-bloc="${id}"]) to (:scope [cms-bloc]) {\n${style.trim()}\n}\n}`
                : "",
        );
    },
);

test("rewrites forward references and both animation properties without touching comments or other values", () => {
    const style = `/* fade */ :scope { animation: fade 1s; animation-name: fade; content: "fade"; --${id}-label: fade; } ${frames}`;
    const compiled = compileBlocStyle(id, style);
    const [owned] = names(compiled);
    expect(owned).toMatch(/^ulvia-kf-/);
    expect(compiled).toContain(`animation: ${owned} 1s; animation-name: ${owned}; content: "fade";`);
    expect(compiled).toContain(`/* fade */`);
    expect(compiled).toContain(`--${id}-label: fade`);
    expect(compileBlocStyle(id, style)).toBe(compiled);
});

test("isolates the same local name across publishers, collections, Blocs and ambiguous prefix boundaries", () => {
    const owners = [id, "example--atlas--other", "example--other--panel", "other--atlas--panel", `${id}-x`];
    const owned = owners.map((owner) => names(compileBlocStyle(owner, frames))[0]);
    expect(new Set(owned).size).toBe(owners.length);
    expect(names(compileBlocStyle(id, "@keyframes x-fade {}"))[0]).not.toBe(owned.at(-1));
});

test("matches names case-sensitively and normalizes equivalent identifier and string escapes", () => {
    const compiled = compileBlocStyle(
        id,
        String.raw`@keyframes f\61 de {} @keyframes "fade" {} @keyframes Fade {}
        :scope { animation-name: \66 ade, "f\61 de", Fade; }`,
    );
    const [first, same, different] = names(compiled);
    expect(first).toBe(same);
    expect(different).not.toBe(first);
    expect(compiled).toContain(`animation-name: ${first}, "${first}", ${different}`);
});

test("decodes literal backslashes exactly once in identifier and quoted names", () => {
    const local = String.raw`f\61de`;
    const escaped = ident.encode(local);
    const quoted = JSON.stringify(local);
    const compiled = compileBlocStyle(
        id,
        `@keyframes ${escaped} {} @keyframes ${quoted} {}
        :scope { animation-name: ${escaped}, ${quoted}; }`,
    );
    const [owned, same] = names(compiled);
    expect(same).toBe(owned);
    expect(compiled).toContain(`animation-name: ${owned}, "${owned}"`);
    expect(names(compileBlocStyle(id, "@keyframes fade {}"))[0]).not.toBe(owned);
});

test.each(["linear", "infinite", "reverse", "both", "running"])(
    "uses grammar to distinguish the animation name from the %s keyword",
    (keyword) => {
        const compiled = compileBlocStyle(
            id,
            `@keyframes ${keyword} {} :scope { animation: 1s ${keyword} ${keyword}; }`,
        );
        expect(compiled).toContain(`animation: 1s ${keyword} ${names(compiled)[0]}`);
    },
);

test("handles multiple animations, function commas, calc(), omitted names, resets and quoted keyword names", () => {
    const compiled = compileBlocStyle(
        id,
        `${frames} @keyframes "none" {} :scope {
        animation: fade calc(1s + 2s) steps(2, end), 2s linear, 3s "none";
        animation-name: none, fade, "none"; animation: initial;
    }`,
    );
    const [fade, none] = names(compiled);
    expect(compiled).toContain(`animation: ${fade} calc(1s + 2s) steps(2, end), 2s linear, 3s "${none}"`);
    expect(compiled).toContain(`animation-name: none, ${fade}, "${none}"; animation: initial;`);
});

test("preserves quoted token boundaries without introducing whitespace-dependent parsing changes", () => {
    const compiled = compileBlocStyle(id, `${frames} :scope { animation:1s"fade"; animation: "fade"1s; }`);
    const [owned] = names(compiled);
    expect(compiled).toContain(`animation:1s"${owned}"; animation: "${owned}"1s;`);
});

test("retains conditional overrides and rewrites vendor-prefixed and escaped spellings", () => {
    const compiled = compileBlocStyle(
        id,
        String.raw`@-webkit-keyframes fade {} @keyframes fade {}
        @media (min-width: 1px) { @supports (display: grid) { @keyframes fade { to { opacity: .5; } } } }
        :scope { -webkit-animation: fade 1s; -moz-animation-name: fade; an\69mation: fade 2s; }
        @\6b eyframes fade { to { opacity: 1; } }`,
    );
    const owned = names(compiled)[0];
    expect(compiled).toContain(
        `-webkit-animation: ${owned} 1s; -moz-animation-name: ${owned}; an\\69mation: ${owned} 2s`,
    );
    expect(compiled).toContain(`@\\6b eyframes ${owned}`);
    expect(new Set(names(compiled)).size).toBe(1);
});

test("encodes arbitrary quoted names without generated-name collisions or CSS injection", () => {
    const locals = ["", "a-b", "ab", "a b", "a/b", "🎉", "é", "é", 'a"}body{opacity:0}'];
    const owned = locals.map((local) => names(compileBlocStyle(id, `@keyframes ${JSON.stringify(local)} {}`))[0]);
    expect(new Set(owned).size).toBe(locals.length);
    for (const name of owned) {
        expect(name).toMatch(/^[a-z0-9-]+$/);
    }
});

test("allows dynamic timing parameters in separate longhands", () => {
    const style = `${frames} :scope { animation-name: fade; animation-duration: var(--${id}-duration, 1s); }`;
    expect(compileBlocStyle(id, style)).toContain(`animation-duration: var(--${id}-duration, 1s)`);
});

test("delimiter validation ignores braces and parentheses in comments, strings and escaped names", () => {
    const source = String.raw`/* } ) ] */ @keyframes "fade})" {} :scope {
        content: "})]"; animation-name: "fade})"; --example--atlas--panel-symbol: \}; }`;
    expect(() => compileBlocStyle(id, source)).not.toThrow();
});

test("processes long animation lists without repeated grammar trace scans", () => {
    const list = Array.from({ length: 1000 }, () => "fade 1s steps(2, end)").join(", ");
    const compiled = compileBlocStyle(id, `${frames} :scope { animation: ${list}; }`);
    const [owned] = names(compiled);
    expect(compiled.split(`${owned} 1s steps(2, end)`)).toHaveLength(1001);
});
