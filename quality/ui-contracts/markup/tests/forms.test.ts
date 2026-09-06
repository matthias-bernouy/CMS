import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const path = "packages/surfaces/cms-control/src/static/admin/example.html";
const inspect = (content: string, file = path) => inspectMarkup({ path: file, content, kind: "html", browser: true });

describe("declarative source form contracts", () => {
    test("distinguishes ignored automatic methods from proven GET mutations", () => {
        expect(inspect('<form cms-source="/api/search" cms-source-method="POST"></form>')[0]).toMatchObject({
            severity: "WARNING",
            rule: "source-automatic-method",
        });
        expect(
            inspect('<form cms-source="/api/search" cms-source-trigger="submit" cms-source-method="POST"></form>'),
        ).toEqual([]);
        expect(inspect('<div cms-source="{{BASE_PATH}}/logout?returnTo=/login as result"></div>')[0]).toMatchObject({
            severity: "ERROR",
            rule: "source-automatic-mutation",
        });
        for (const value of ["/api/remove", "https://example.test/logout", "/logout-history", "{{ endpoint }}"]) {
            expect(inspect(`<div cms-source="${value}"></div>`)).toEqual([]);
        }
        expect(inspect('<div cms-source="/logout"></div>', "packages/resources/example/template.html")).toEqual([]);
    });

    test("does not confuse static method metadata with dynamic values", () => {
        expect(inspect('<div cms-source="/api/search" cms-source-method="{{ method }}"></div>')).toEqual([]);
        expect(
            inspect(
                '<form cms-source="/api/search" cms-source-trigger="{{ trigger }}" cms-source-method="POST"></form>',
            ),
        ).toEqual([]);
        expect(inspect('<div cms-source="/api/search" cms-source-method="GET"></div>')).toEqual([]);
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

    test("allows other sources to reload and ignores attributes on non-submitting owners", () => {
        expect(
            inspect(`<section cms-source="/api/settings" cms-reload-on="settings:saved"></section>
            <form cms-source="/api/settings" cms-source-trigger="submit" cms-source-publish="settings:saved" cms-reload-on="refresh:form"></form>
            <div cms-source="/api/read" cms-source-publish="read:done" cms-reload-on="read:done"></div>`),
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
                id: { from: "queryParam", name: "id" },
                draft: { from: "state", name: "draft" },
                enabled: { from: "raw", value: false },
                count: { from: "raw", value: 0 },
            }),
        ).toEqual([]);
        for (const value of [
            { id: 12 },
            [{ id: 12 }],
            { id: { from: "raw", value: [] } },
            { id: { from: "queryParam", name: " " } },
            { id: { from: "raw", value: "" } },
        ]) {
            expect(body(value)[0]).toMatchObject({ severity: "WARNING", rule: "source-body-contract" });
        }
        expect(body({ id: 12 }, "GET")).toEqual([]);
        expect(body({ id: { from: "raw", value: "{{ id }}" } })).toEqual([]);
        expect(body({})).toEqual([]);
    });

    test("respects quoted delimiters, HTML entities and first duplicate attributes", () => {
        const source = `<form title="a > b" cms-source="/api/save" cms-source-trigger="submit" cms-source-trigger="auto" cms-source-method="POST" cms-source-body="{&quot;id&quot;:{&quot;from&quot;:&quot;raw&quot;,&quot;value&quot;:12}}"></form>`;
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
