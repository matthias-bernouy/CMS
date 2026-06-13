import { describe, test, expect } from "bun:test";
import { validateBloc, validateBlocTag } from "@bernouy/cms-bloc-compile";

describe("validateBlocTag", () => {
    test.each([
        ["my-card"],
        ["a-b"],
        ["app-v2"],
        ["base-card"],
        ["super-cool-bloc"],
    ])("accepts %p", (tag) => {
        expect(validateBlocTag(tag)).toBeNull();
    });

    test.each([
        ["card"],         // no dash
        ["My-Card"],      // uppercase
        ["1-card"],       // leading digit
        ["my--card"],     // double dash
        ["my-card-"],     // trailing dash
    ])("rejects malformed %p", (tag) => {
        expect(validateBlocTag(tag)).not.toBeNull();
    });

    test.each([
        ["w13c-button"],
        ["w13c-foo"],
        ["p9r-input"],
        ["p9r-anything"],
        ["be5-card"],
        ["be5-anything"],
        ["cms-foo"],
        ["cms-anything"],
    ])("rejects reserved prefix %p", (tag) => {
        expect(validateBlocTag(tag)).toMatch(/reserved prefix/);
    });
});

describe("validateBloc — source patterns", () => {
    test("accepts source without customElements.define", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `import { Component } from "@bernouy/components/base";
                         export class MyBloc extends Component {}`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("accepts placeholder customElements.define", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("BE5_TAG_TO_BE_REPLACED", X);`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("accepts a single legitimate customElements.define matching the bloc tag (build-wrapper output)", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", X);`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("rejects duplicate customElements.define on the same bloc tag (author added their own on top of the wrapper)", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", X); customElements.define("my-bloc", X);`,
        });
        expect(r.errors).toEqual([expect.stringContaining("duplicate")]);
    });

    test("rejects customElements.define with a different tag than the bloc", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("other-tag", X);`,
        });
        expect(r.errors).toEqual([
            expect.stringContaining(`Bloc: hardcoded \`customElements.define("other-tag"`),
        ]);
    });

    test("rejects hardcoded customElements.define in editor", () => {
        const r = validateBloc({
            tag: "my-bloc",
            editorSource: `customElements.define('foo-bar', Y);`,
        });
        expect(r.errors).toEqual([
            expect.stringContaining("BlocEditor"),
        ]);
    });
});

describe("validateBloc — Location mutations (#6)", () => {
    test("rejects `location.href = …` in viewSource", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", class { go() { location.href = "/x"; } });`,
        });
        expect(r.errors).toEqual([expect.stringContaining("location.href = …")]);
    });

    test("rejects `window.location = …` in editorSource", () => {
        const r = validateBloc({
            tag: "my-bloc",
            editorSource: `customElements.define("my-bloc", class { go() { window.location = "/x"; } });`,
        });
        expect(r.errors).toEqual([expect.stringContaining("window.location = …")]);
    });

    test("rejects `location.assign(...)` and `location.replace(...)`", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", class {
                a() { location.assign("/a"); }
                b() { location.replace("/b"); }
            });`,
        });
        expect(r.errors.filter(e => e.includes("location.assign(…)"))).toHaveLength(1);
        expect(r.errors.filter(e => e.includes("location.replace(…)"))).toHaveLength(1);
    });

    test("accepts `history.pushState` and `<a href>` patterns", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", class {
                go() { history.pushState({}, "", "/x"); }
                anchor() { return '<a href="/y">y</a>'; }
            });`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("does not false-positive on `window.location ==` comparisons", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", class {
                check() { return window.location == otherLocation; }
            });`,
        });
        expect(r.errors).toHaveLength(0);
    });
});

describe("validateBloc — graceful degradation", () => {
    test("only tag → only tag check runs, no errors when valid", () => {
        const r = validateBloc({ tag: "my-bloc" });
        expect(r.errors).toHaveLength(0);
    });

    test("returns tag error even when other inputs are missing", () => {
        const r = validateBloc({ tag: "BAD-TAG" });
        expect(r.errors.length).toBeGreaterThan(0);
    });
});
