import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const path = "packages/surfaces/cms-kernel/src/core/admin/auth/templates/example.html";
const inspect = (content: string, file = path) => inspectMarkup({ path: file, content, kind: "html", browser: true });

describe("declarative source form contracts", () => {
    test("reserves sources for native form submissions", () => {
        expect(inspect('<form cms-source="/api/search" cms-source-method="POST"></form>')).toEqual([]);
        expect(
            inspect('<form cms-source="/api/search" cms-source-trigger="submit" cms-source-method="POST"></form>'),
        ).toEqual([]);
        expect(inspect('<div cms-source="/api/search"></div>')[0]).toMatchObject({
            severity: "ERROR",
            rule: "source-form-owner",
        });
    });

    test("does not confuse static method metadata with dynamic values", () => {
        expect(
            inspect(
                '<form cms-source="/api/search" cms-source-trigger="{{ trigger }}" cms-source-method="POST"></form>',
            ),
        ).toEqual([]);
    });

    test("rejects explicit publish/reload self loops, including native success events", () => {
        for (const trigger of ["submit", "change"]) {
            for (const event of ["settings:saved", "cms-source:success", "form:success"]) {
                expect(
                    inspect(
                        `<form cms-source="/api/settings" cms-source-trigger="${trigger}" cms-source-publish="${event}" cms-reload-on="other ${event}"></form>`,
                    )[0],
                ).toMatchObject({ severity: "ERROR", rule: "source-publish-reload-loop" });
            }
        }
        expect(
            inspect(
                '<form cms-source="/api/settings" cms-source-trigger="submit" cms-reload-on="cms-source:success"></form>',
            )[0]?.rule,
        ).toBe("source-publish-reload-loop");
    });

    test("allows forms to publish distinct reload events", () => {
        expect(
            inspect(
                '<form cms-source="/api/settings" cms-source-trigger="submit" cms-source-publish="settings:saved" cms-reload-on="refresh:form"></form>',
            ),
        ).toEqual([]);
        expect(
            inspect(
                '<form cms-source="/api/settings" cms-source-trigger="submit" cms-source-publish="{{ event }}" cms-reload-on="settings:saved"></form>',
            ),
        ).toEqual([]);
    });

    test("checks the supported source-body descriptor shape rather than ordinary payload JSON", () => {
        const body = (value: unknown, method = "POST") =>
            inspect(
                `<form cms-source="/api/save" cms-source-trigger="submit" cms-source-method="${method}" cms-source-body='${JSON.stringify(value)}'></form>`,
            );
        expect(
            body({
                id: { from: "state", key: "@param:site-id" },
                draft: { from: "state", key: "@page:site-draft" },
                enabled: { from: "literal", value: false },
                count: { from: "literal", value: 0 },
            }),
        ).toEqual([]);
        for (const value of [{ id: 12 }, [{ id: 12 }], { id: { from: "state", key: "@param:site/id" } }, {}]) {
            expect(body(value)[0]).toMatchObject({ severity: "WARNING", rule: "source-body-contract" });
        }
        expect(body({ id: { from: "literal", value: [] } })).toEqual([]);
        expect(body({ id: { from: "literal", value: "" } })).toEqual([]);
        expect(body({ id: 12 }, "GET")).toEqual([]);
        expect(body({ id: { from: "literal", value: "{{ id }}" } })).toEqual([]);
    });

    test("respects quoted delimiters, HTML entities and first duplicate attributes", () => {
        const source = `<form title="a > b" cms-source="/api/save" cms-source-trigger="submit" cms-source-trigger="auto" cms-source-method="POST" cms-source-body="{&quot;id&quot;:{&quot;from&quot;:&quot;literal&quot;,&quot;value&quot;:12}}"></form>`;
        expect(inspect(source)).toEqual([]);
        const loop = inspect(
            '<form\n cms-source="/api/save" cms-source-trigger="submit"\n cms-source-publish="x&#32;y" cms-reload-on="y"></form>',
        );
        expect(loop[0]).toMatchObject({ line: 3, column: 31, rule: "source-publish-reload-loop" });
    });

    test("also checks rendered forms in script strings", () => {
        const findings = inspectMarkup({
            path: "example.ts",
            kind: "script",
            browser: true,
            content: `function render() { return '<form cms-source="/api/save" cms-source-trigger="submit" cms-source-publish="changed" cms-reload-on="changed"></form>'; }`,
        });
        expect(findings[0]?.rule).toBe("source-publish-reload-loop");
    });
});
