import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldProject } from "cms-cli/CLI_init";

describe("p9r init integration filesystem", () => {
    test("scaffolds integration inputs and generated source artifact folders", async () => {
        const cwd = mkdtempSync(join(tmpdir(), "p9r-init-integrations-"));

        const { target } = await scaffoldProject({
            cwd,
            folder:   "demo-site",
            template: "full",
            force:    false,
        });

        expect(existsSync(join(target, "site", "gateways"))).toBe(false);
        expect(existsSync(join(target, "site", "integrations", ".gitkeep"))).toBe(true);
        expect(existsSync(join(target, "site", ".p9r", "generated", "sources", ".gitkeep"))).toBe(true);
    });
});
