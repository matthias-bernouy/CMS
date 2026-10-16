import { describe, test, expect } from "bun:test";
import { validateBloc, validateBlocTag } from "@bernouy/cms-repository/collections/build";

describe("validateBlocTag", () => {
    test.each([["my-card"], ["a-b"], ["app-v2"], ["base-card"], ["super-cool-bloc"]])("accepts %p", (tag) => {
        expect(validateBlocTag(tag)).toBeNull();
    });

    test.each([
        ["card"], // no dash
        ["My-Card"], // uppercase
        ["1-card"], // leading digit
        ["my--card"], // double dash
        ["my-card-"], // trailing dash
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
        expect(validateBlocTag(tag)).toMatch(/reserved .* namespace/);
    });
});

describe("validateBloc — source patterns", () => {
    test("accepts source without customElements.define", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `export function mount(root) { root.toggleAttribute("ready", true); }`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("rejects every direct custom element registration", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `customElements.define("my-bloc", X);`,
        });
        expect(r.errors).toEqual([expect.stringContaining("is forbidden")]);
    });

    test("rejects window.customElements registration with flexible spacing", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `window . customElements . define ("other-tag", X);`,
        });
        expect(r.errors).toEqual([expect.stringContaining("BlocBehavior")]);
    });

    test.each([
        [`export function mount(root) { root.attachShadow({ mode: "open" }); }`],
        [`export function mount(root) { return root.shadowRoot; }`],
    ])("rejects removed Shadow DOM APIs", (viewSource) => {
        const result = validateBloc({ tag: "my-bloc", viewSource });
        expect(result.errors).toEqual([expect.stringContaining("Shadow DOM APIs are forbidden")]);
    });
});

describe("validateBloc — Location mutations (#6)", () => {
    test("rejects `location.href = …` in viewSource", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `export function mount() { location.href = "/x"; }`,
        });
        expect(r.errors).toEqual([expect.stringContaining("location.href = …")]);
    });

    test("rejects `location.assign(...)` and `location.replace(...)`", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `export class Bloc {
                a() { location.assign("/a"); }
                b() { location.replace("/b"); }
            }`,
        });
        expect(r.errors.filter((e) => e.includes("location.assign(…)"))).toHaveLength(1);
        expect(r.errors.filter((e) => e.includes("location.replace(…)"))).toHaveLength(1);
    });

    test("accepts `history.pushState` and `<a href>` patterns", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `export class Bloc {
                go() { history.pushState({}, "", "/x"); }
                anchor() { return '<a href="/y">y</a>'; }
            }`,
        });
        expect(r.errors).toHaveLength(0);
    });

    test("does not false-positive on `window.location ==` comparisons", () => {
        const r = validateBloc({
            tag: "my-bloc",
            viewSource: `export class Bloc {
                check() { return window.location == otherLocation; }
            }`,
        });
        expect(r.errors).toHaveLength(0);
    });
});

describe("validateBloc — CSS variable writes", () => {
    test("accepts owned variables and variables owned by declared dependencies", () => {
        const result = validateBloc({
            tag: "atlas-tabs",
            uses: ["atlas-tab"],
            viewSource: `export function mount(root) {
                root.style.setProperty("--atlas-tabs-offset", "1px");
                root.style.setProperty("--atlas-tab-color", "red");
            }`,
        });
        expect(result.errors).toHaveLength(0);
    });

    test("rejects arbitrary, foreign and dynamically named variables", () => {
        const result = validateBloc({
            tag: "atlas-tabs",
            viewSource: `export function mount(root, name) {
                root.style.setProperty("--random-color", "red");
                root.style.setProperty(name, "red");
            }`,
        });
        expect(result.errors).toEqual([
            expect.stringContaining("static lowercase literal name"),
            expect.stringContaining("must belong to Bloc atlas-tabs"),
        ]);
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

    test("rejects native tag names because collection Blocs require namespaced identifiers", () => {
        const tags = ["a", "article", "aside", "div", "footer", "h1", "header", "main", "nav", "p", "section", "svg"];
        for (const tag of tags) {
            expect(validateBloc({ tag }).errors).toEqual([expect.stringContaining("namespaced Bloc identifier")]);
        }
    });

    test("rejects legacy form-control artifacts now owned by the platform", () => {
        const tags = [
            "form",
            "fieldset",
            "legend",
            "label",
            "input",
            "textarea",
            "select",
            "option",
            "button",
            "output",
            "img",
        ];
        for (const tag of tags) {
            expect(validateBloc({ tag }).errors[0]).toContain("namespaced Bloc identifier");
        }
    });
});
