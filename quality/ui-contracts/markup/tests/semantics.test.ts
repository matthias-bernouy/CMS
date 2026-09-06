import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const inspect = (content: string) => inspectMarkup({ path: "example.html", content, kind: "html", browser: true });

describe("source submission ownership and document events", () => {
    test("warns when non-form event targets declare a method that only forms submit", () => {
        for (const trigger of ["submit", "change"]) {
            for (const method of ["POST", "DELETE", "HEAD"]) {
                const content = `<form><section cms-source="/api/search" cms-source-trigger="${trigger}" cms-source-method="${method}"></section></form>`;
                expect(inspect(content)[0]).toMatchObject({ rule: "source-trigger-target", severity: "WARNING" });
                expect(inspect(content)[0]?.message).toContain("performs GET");
            }
        }
    });

    test("preserves event-triggered GET refreshes and native form methods", () => {
        for (const trigger of ["submit", "change"]) {
            expect(
                inspect(
                    `<form><section cms-source="/api/search" cms-source-trigger="${trigger}" cms-source-method="GET"></section></form>`,
                ),
            ).toEqual([]);
            expect(
                inspect(
                    `<form cms-source="/api/search" cms-source-trigger="${trigger}" cms-source-method="HEAD"></form>`,
                ),
            ).toEqual([]);
            expect(
                inspect(
                    `<section cms-source="/api/search" cms-source-trigger="${trigger}" cms-source-method="{{ method }}"></section>`,
                ),
            ).toEqual([]);
        }
    });

    test("does not imply that automatic HEAD is honored", () => {
        const findings = inspect('<form cms-source="/api/search" cms-source-method="HEAD"></form>');
        expect(findings[0]).toMatchObject({ rule: "source-automatic-method", severity: "WARNING" });
        expect(findings[0]?.message).toBe("Automatic sources perform GET; the declared HEAD method is ignored.");
    });

    test("source aliases and repeated rows do not isolate document reload events", () => {
        const content =
            '<form cms-repeat="rows" cms-source="/api/save as rowResult" cms-source-trigger="submit" cms-source-publish="row:saved" cms-reload-on="row:saved"></form>';
        expect(inspect(content)[0]).toMatchObject({ rule: "source-publish-reload-loop", severity: "ERROR" });
    });

    test("known bubbling success events still loop when explicit publication is dynamic", () => {
        for (const event of ["cms-source:success", "form:success"]) {
            const content = `<form cms-source="/api/save" cms-source-trigger="submit" cms-source-publish="{{ event }}" cms-reload-on="${event}"></form>`;
            expect(inspect(content)[0]).toMatchObject({ rule: "source-publish-reload-loop", severity: "ERROR" });
        }
    });

    test("non-form GET results do not emit submission success or publication events", () => {
        const content =
            '<form><section cms-source="/api/read" cms-source-trigger="change" cms-source-publish="read:done" cms-reload-on="read:done cms-source:success"></section></form>';
        expect(inspect(content)).toEqual([]);
    });
});
