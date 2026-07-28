import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pullIntegrations } from "cms-cli/push/integrations/pull";
import { withFetch } from "./fixtures";

const PACKAGE_DIGEST = "a".repeat(64);

describe("pullIntegrations package provenance", () => {
    test("preserves a remote digest only in generated installation state", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-int-provenance-"));

        await pullDetail(siteDir, { packageDigest: PACKAGE_DIGEST });

        const installation = readGeneratedInstallation(siteDir);
        expect(installation.packageDigest).toBe(PACKAGE_DIGEST);

        const authoringImport = readJson<Record<string, unknown>>(join(siteDir, "integrations", "demo.json"));
        expect(Object.hasOwn(authoringImport, "packageDigest")).toBeFalse();
    });

    test("keeps package provenance absent for a legacy remote installation", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-int-legacy-"));

        await pullDetail(siteDir);

        const installation = readGeneratedInstallation(siteDir);
        expect(Object.hasOwn(installation, "packageDigest")).toBeFalse();

        const authoringImport = readJson<Record<string, unknown>>(join(siteDir, "integrations", "demo.json"));
        expect(Object.hasOwn(authoringImport, "packageDigest")).toBeFalse();
    });
});

async function pullDetail(siteDir: string, extra: Record<string, unknown> = {}): Promise<void> {
    await withFetch(
        async (url) => {
            if (url.endsWith("/api/integrations/installations")) {
                return Response.json([{ id: "demo" }]);
            }
            if (url.includes("/api/integrations/installations?id=demo")) {
                return Response.json(remoteDetail(extra));
            }
            return new Response("not found", { status: 404 });
        },
        async () => {
            expect(await pullIntegrations(new URL("http://cms.test/"), "token", siteDir)).toEqual({
                pulled: ["demo"],
                failed: [],
            });
        },
    );
}

function remoteDetail(extra: Record<string, unknown>): Record<string, unknown> {
    return {
        id: "demo",
        label: "Demo",
        definitionVersion: "1.0.0",
        status: "success",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        runCount: 1,
        answers: { id: "main" },
        artifacts: [],
        runs: [],
        ...extra,
    };
}

function readGeneratedInstallation(siteDir: string): Record<string, unknown> {
    const installations = readJson<unknown>(join(siteDir, ".p9r", "generated", "integration-installations.json"));
    if (!Array.isArray(installations) || !installations[0]) {
        throw new Error("expected one generated integration installation");
    }
    return installations[0] as Record<string, unknown>;
}

function readJson<T>(file: string): T {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
}
