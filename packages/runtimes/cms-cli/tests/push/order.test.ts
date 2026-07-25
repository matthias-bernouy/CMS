import { describe, expect, test } from "bun:test";
import { FULL_PUSH_ORDER } from "cms-cli/commands/CLI_push";

describe("CLI full push ordering", () => {
    test("publishes page-link targets before running integration hooks", () => {
        expect(FULL_PUSH_ORDER).toEqual([
            "system",
            "files",
            "blocs",
            "templates",
            "integration-pages",
            "integrations",
            "pages",
        ]);
        expect(FULL_PUSH_ORDER.indexOf("integration-pages")).toBeLessThan(FULL_PUSH_ORDER.indexOf("integrations"));
        expect(FULL_PUSH_ORDER.indexOf("pages")).toBeGreaterThan(FULL_PUSH_ORDER.indexOf("integrations"));
    });
});
