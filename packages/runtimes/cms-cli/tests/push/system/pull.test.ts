import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pullSystem } from "cms-cli/push/system/pull";
import { scanSystem } from "cms-cli/push/system/scan";
import { withFetch } from "../integrations/fixtures";

describe("pullSystem", () => {
    test("writes supported system settings and preserves them through a scan round trip", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-system-pull-"));

        await withFetch(
            async (url, init) => {
                expect(url).toBe("http://cms.test/api/system/settings");
                expect(init?.headers).toEqual({ Authorization: "Bearer token" });
                return Response.json({
                    site: { name: "Foo", theme: ":root { --x: red; }" },
                    editor: { layoutCategory: "Layouts" },
                });
            },
            async () => {
                await pullSystem(new URL("http://cms.test/"), "token", siteDir);
            },
        );

        const pulled = JSON.parse(readFileSync(join(siteDir, "system.json"), "utf-8"));
        expect(pulled.site.name).toBe("Foo");
        expect((await scanSystem(siteDir))?.payload.site.name).toBe("Foo");
    });

    test("does not invent integration-owned settings for a minimal response", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-system-pull-"));

        await withFetch(
            async () => Response.json({ site: { name: "Legacy" }, editor: {} }),
            async () => {
                await pullSystem(new URL("http://cms.test/"), "token", siteDir);
            },
        );

        const pulled = JSON.parse(readFileSync(join(siteDir, "system.json"), "utf-8"));
        expect(pulled).not.toHaveProperty("auth");
        expect((await scanSystem(siteDir))?.payload).not.toHaveProperty("auth");
    });
});
