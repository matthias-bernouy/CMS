import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pullSystem } from "cms-cli/push/system/pull";
import { scanSystem } from "cms-cli/push/system/scan";
import { withFetch } from "../integrations/fixtures";

const auth = {
    signupLegalDocuments: [
        {
            key: "terms-of-use",
            label: "Terms of use",
            consentText: "I accept the terms of use.",
            pageId: "stable-cms-page-id",
            enabled: true,
        },
    ],
};

describe("pullSystem signup legal policy", () => {
    test("writes documents and preserves them through a scan round trip", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-system-pull-"));

        await withFetch(
            async (url, init) => {
                expect(url).toBe("http://cms.test/api/system/settings");
                expect(init?.headers).toEqual({ Authorization: "Bearer token" });
                return Response.json({
                    site: { name: "Foo", theme: ":root { --x: red; }" },
                    editor: { layoutCategory: "Layouts" },
                    auth,
                });
            },
            async () => {
                await pullSystem(new URL("http://cms.test/"), "token", siteDir);
            },
        );

        const pulled = JSON.parse(readFileSync(join(siteDir, "system.json"), "utf-8"));
        expect(pulled.auth).toEqual(auth);
        expect((await scanSystem(siteDir))?.payload.auth).toEqual(auth);
    });

    test("normalizes a legacy response without auth to an explicit empty policy", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-system-pull-"));

        await withFetch(
            async () => Response.json({ site: { name: "Legacy" }, editor: {} }),
            async () => {
                await pullSystem(new URL("http://cms.test/"), "token", siteDir);
            },
        );

        const pulled = JSON.parse(readFileSync(join(siteDir, "system.json"), "utf-8"));
        expect(pulled.auth).toEqual({ signupLegalDocuments: [] });
        expect((await scanSystem(siteDir))?.payload.auth).toEqual({ signupLegalDocuments: [] });
    });
});
