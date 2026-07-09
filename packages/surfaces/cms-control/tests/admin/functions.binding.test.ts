import { describe, expect, test } from "bun:test";

describe("functions admin page", () => {
    test("renders functions list through the binding runtime", async () => {
        const html = await Bun.file(new URL("../../src/static/admin/functions.html", import.meta.url)).text();

        expect(html).toContain('cms-source="{{BASE_PATH}}/api/functions"');
        expect(html).toContain('cms-repeat="."');
        expect(html).toContain('href="{{BASE_PATH}}/admin/functions/detail?id={{ id }}"');
        expect(html).toContain("{{ label }}");
        expect(html).toContain("{{ inputLabel }}");
        expect(html).toContain("{{ stepsLabel }}");
    });

    test("renders function detail component", async () => {
        const html = await Bun.file(new URL("../../src/static/admin/functions/detail.html", import.meta.url)).text();

        expect(html).toContain("<cms-function-detail>");
    });
});
