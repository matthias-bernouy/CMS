import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalIntegrationHash, scanIntegrations } from "cms-cli/push/integrations/scan";
import { classifyIntegrations } from "cms-cli/push/integrations/classify";
import { emptyState, localIntegration, makeSite, manualSourceImport } from "./fixtures";
import type { PushState } from "cms-cli/push/shared/state";

describe("scanIntegrations", () => {
    test("reads each integrations/*.json as an integration import", async () => {
        const dir = makeSite({
            "shop.json": JSON.stringify({ ...manualSourceImport(), version: "1.2.3-beta.1+build.7" }),
        });
        const entries = await scanIntegrations(dir);

        expect(entries.length).toBe(1);
        expect(entries[0]!.id).toBe("manual-source");
        expect(entries[0]!.slug).toBe("shop");
        expect(entries[0]!.file).toBe("integrations/shop.json");
        expect(entries[0]!.request.kind).toBe("manual-source");
        expect(entries[0]!.request.version).toBe("1.2.3-beta.1+build.7");
        expect(entries[0]!.request.definition?.kind).toBe("manual-source");
        expect(entries[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("returns [] when site/integrations/ is missing", async () => {
        const dir = mkdtempSync(join(tmpdir(), "p9r-int-empty-"));
        expect(await scanIntegrations(dir)).toEqual([]);
    });

    test("rejects invalid JSON and missing integration fields", async () => {
        await expect(scanIntegrations(makeSite({ "bad.json": "{not json" }))).rejects.toThrow(/Invalid integration/);
        await expect(scanIntegrations(makeSite({ "nokind.json": JSON.stringify({ answers: {} }) }))).rejects.toThrow(
            /missing "kind"/,
        );
        await expect(
            scanIntegrations(makeSite({ "noanswers.json": JSON.stringify({ kind: "manual-source" }) })),
        ).rejects.toThrow(/missing "answers" object/);
    });

    test("rejects a version that is not exact canonical SemVer", async () => {
        for (const version of ["1", "v1.2.3", " 1.2.3", "1.2.3 "]) {
            const dir = makeSite({ "shop.json": JSON.stringify({ ...manualSourceImport(), version }) });
            await expect(scanIntegrations(dir)).rejects.toThrow(/version must be an exact SemVer 2\.0 version/);
        }
    });
});

describe("canonicalIntegrationHash", () => {
    test("changes when the integration import changes", () => {
        const hash = canonicalIntegrationHash(manualSourceImport());
        expect(canonicalIntegrationHash(manualSourceImport("shop", "https://api.example.com/changed"))).not.toBe(hash);
    });

    test("includes the requested version", () => {
        const request = manualSourceImport();
        expect(canonicalIntegrationHash({ ...request, version: "1.0.0" })).not.toBe(
            canonicalIntegrationHash({ ...request, version: "1.0.1" }),
        );
    });
});

describe("classifyIntegrations", () => {
    test("new when id absent remotely; unchanged when hash matches state; update otherwise", () => {
        const local = [localIntegration("manual-source", "h1")];
        expect(classifyIntegrations(local, new Set(), emptyState(), false)[0]!.status).toBe("new");

        const state: PushState = {
            tenant: "",
            lastPulled: "",
            entities: { "integration:manual-source": { hash: "h1", lastSeenRemote: "h1" } },
        };
        expect(classifyIntegrations(local, new Set(["manual-source"]), state, false)[0]!.status).toBe("unchanged");
        expect(
            classifyIntegrations(
                [localIntegration("manual-source", "h2")],
                new Set(["manual-source"]),
                state,
                false,
            )[0]!.status,
        ).toBe("update");
        expect(classifyIntegrations(local, new Set(["manual-source"]), state, true)[0]!.status).toBe("update");
    });
});
