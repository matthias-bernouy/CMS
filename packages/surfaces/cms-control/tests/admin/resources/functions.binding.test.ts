import { describe, expect, test } from "bun:test";
import { fieldWrap } from "cms-control/components/admin/Resources/Functions/dom";

describe("functions admin page", () => {
    test("renders functions list through the binding runtime", async () => {
        const html = await Bun.file(
            new URL("../../../src/static/admin/_operations/functions.html", import.meta.url),
        ).text();

        expect(html).toContain('cms-source="{{BASE_PATH}}/api/functions"');
        expect(html).toContain('cms-repeat="."');
        expect(html).toContain('href="{{BASE_PATH}}/admin/functions/detail?id={{ id }}"');
        expect(html).toContain("{{ label }}");
        expect(html).toContain("{{ inputLabel }}");
        expect(html).toContain("{{ stepsLabel }}");
    });

    test("renders function detail component", async () => {
        const html = await Bun.file(
            new URL("../../../src/static/admin/_operations/functions/detail.html", import.meta.url),
        ).text();

        expect(html).toContain("<cms-function-detail>");
    });

    test("associates generated field labels with their controls", () => {
        const control = document.createElement("textarea");
        const field = fieldWrap("Request template", control);
        const label = field.querySelector("label")!;

        expect(control.id).toStartWith("function-field-");
        expect(label.htmlFor).toBe(control.id);
        expect(field.querySelector(`#${control.id}`)).toBe(control);
    });
});
