import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const inspect = (content: string) => inspectMarkup({ path: "example.html", content, kind: "html", browser: true });

describe("source submission ownership", () => {
    test("rejects non-form sources regardless of trigger or method", () => {
        for (const trigger of ["submit", "change"]) {
            for (const method of ["POST", "DELETE"]) {
                const content = `<form><section cms-source="/api/search" cms-source-trigger="${trigger}" cms-source-method="${method}"></section></form>`;
                expect(inspect(content)[0]).toMatchObject({ rule: "source-form-owner", severity: "ERROR" });
            }
        }
    });

    test("accepts the closed form method set", () => {
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
            expect(inspect(`<form cms-source="/api/search" cms-source-method="${method}"></form>`)).toEqual([]);
        }
    });
});
