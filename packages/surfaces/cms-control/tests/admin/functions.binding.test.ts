import { describe, expect, test } from "bun:test";

describe("functions admin page", () => {
    test("renders functions through the binding runtime", async () => {
        const html = await Bun.file(new URL("../../src/static/admin/functions.html", import.meta.url)).text();

        expect(html).toContain('cms-source="{{BASE_PATH}}/api/functions"');
        expect(html).toContain('cms-repeat="."');
        expect(html).toContain("{{ label }}");
        expect(html).toContain("{{ stepsLabel }}");
    });
});
