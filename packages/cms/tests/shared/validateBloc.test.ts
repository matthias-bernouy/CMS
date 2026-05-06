import { describe, test, expect } from "bun:test";
import { validateBloc, validateBlocTag } from "src/socle/blocs/validateBloc";

describe("validateBlocTag", () => {
    test.each([
        ["my-card"],
        ["a-b"],
        ["app-v2"],
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
    ])("rejects reserved prefix %p", (tag) => {
        expect(validateBlocTag(tag)).toMatch(/reserved prefix/);
    });
});

describe("validateBloc — source patterns", () => {
    test("accepts source without customElements.define", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `import { Component } from "@bernouy/cms/component";
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

    test("rejects hardcoded customElements.define in view", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", X);`,
        });
        expect(r.errors).toEqual([
            expect.stringContaining(`Bloc: hardcoded \`customElements.define("my-bloc"`),
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

describe("validateBloc — empty p9r-comp-sync (#1)", () => {
    test("rejects fully empty", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-comp-sync></p9r-comp-sync>`,
        });
        expect(r.errors).toEqual([expect.stringContaining("must contain at least one child element")]);
    });

    test("rejects whitespace-only", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-comp-sync>   \n  </p9r-comp-sync>`,
        });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test("rejects comments-only", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-comp-sync><!-- nothing here --></p9r-comp-sync>`,
        });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test("accepts non-empty", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-comp-sync><span>Click me</span></p9r-comp-sync>`,
            templateHtml: `<slot></slot>`,
        });
        expect(r.errors).toHaveLength(0);
    });
});

describe("validateBloc — required sync attrs (#5)", () => {
    test("rejects p9r-state-sync missing target/attr/value", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-state-sync></p9r-state-sync>`,
        });
        expect(r.errors.filter(e => e.includes("p9r-state-sync"))).toHaveLength(3);
    });

    test("accepts p9r-state-sync with all required", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-state-sync target=".x" attr="active" value="true" label="Active"></p9r-state-sync>`,
        });
        expect(r.errors.filter(e => e.includes("p9r-state-sync"))).toHaveLength(0);
    });

    test("rejects p9r-state-sync with empty attrs", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-state-sync target="" attr="" value=""></p9r-state-sync>`,
        });
        expect(r.errors.filter(e => e.includes("p9r-state-sync"))).toHaveLength(3);
    });

    test("rejects p9r-link missing name", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-link label="Target"></p9r-link>`,
        });
        expect(r.errors).toEqual([expect.stringContaining(`<p9r-link> requires non-empty "name"`)]);
    });

    test("accepts p9r-link with name", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-link name="href" label="Target"></p9r-link>`,
        });
        expect(r.errors.filter(e => e.includes("p9r-link"))).toHaveLength(0);
    });
});

describe("validateBloc — slot consistency (#4)", () => {
    test("accepts comp-sync child slot matching template", () => {
        const r = validateBloc({
            tag: "my-bloc",
            templateHtml:      `<div><slot name="icon-left"></slot><slot></slot></div>`,
            configurationHtml: `<p9r-comp-sync><span>default</span><img slot="icon-left"/></p9r-comp-sync>`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("rejects comp-sync child targeting unknown slot", () => {
        const r = validateBloc({
            tag: "my-bloc",
            templateHtml:      `<slot></slot>`,
            configurationHtml: `<p9r-comp-sync><span slot="nonexistent">x</span></p9r-comp-sync>`,
        });
        expect(r.errors).toEqual([expect.stringContaining(`slot "nonexistent"`)]);
    });

    test("accepts image-sync slotTarget matching template slot", () => {
        const r = validateBloc({
            tag: "my-bloc",
            templateHtml:      `<slot name="icon-left"></slot>`,
            configurationHtml: `<p9r-image-sync slotTarget="icon-left" label="L"></p9r-image-sync>`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("rejects image-sync slotTarget without matching slot", () => {
        const r = validateBloc({
            tag: "my-bloc",
            templateHtml:      `<slot></slot>`,
            configurationHtml: `<p9r-image-sync slotTarget="missing" label="L"></p9r-image-sync>`,
        });
        expect(r.errors).toEqual([expect.stringContaining(`slotTarget="missing"`)]);
    });
});

describe("validateBloc — graceful degradation", () => {
    test("only tag → only tag check runs, no errors when valid", () => {
        const r = validateBloc({ tag: "my-bloc" });
        expect(r.errors).toHaveLength(0);
        expect(r.warnings).toEqual([
            expect.stringContaining("configurationHtml not provided"),
        ]);
    });

    test("config without template → slot check is skipped (warned)", () => {
        const r = validateBloc({
            tag: "my-bloc",
            configurationHtml: `<p9r-comp-sync><span slot="x">y</span></p9r-comp-sync>`,
        });
        expect(r.warnings).toEqual([
            expect.stringContaining("templateHtml not provided"),
        ]);
        expect(r.errors).toHaveLength(0);
    });

    test("returns tag error even when other inputs are missing", () => {
        const r = validateBloc({ tag: "BAD-TAG" });
        expect(r.errors.length).toBeGreaterThan(0);
    });
});
