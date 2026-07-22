import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

describe("filesystem integration package discovery", () => {
    test("discovers flat and nested packages and stops at their manifests", async () => {
        const root = createRoot();
        writePackage(root, "flat", "flat");
        const nestedRoot = writePackage(root, "providers/payments/stripe", "stripe", [
            { version: "1.0.0", path: "releases/current", definition: "releases/current/definition.json" },
        ]);
        mkdirSync(join(nestedRoot, "releases/current"), { recursive: true });
        writeFileSync(
            join(nestedRoot, "releases/current/definition.json"),
            `${JSON.stringify({ kind: "stripe", label: "Stripe", version: "1.0.0", inputs: [] })}\n`,
        );
        writePackage(nestedRoot, "versions/1.0.0/shadow", "shadow");
        const repository = new FsIntegrationDefinitionRepository(root);

        expect((await repository.list()).map((item) => item.kind)).toEqual(["flat", "stripe"]);
        expect((await repository.getIndex("stripe"))?.kind).toBe("stripe");
        expect((await repository.get("stripe"))?.version).toBe("1.0.0");
        expect(await repository.getIndex("shadow")).toBeNull();
    });

    test("rejects duplicate kinds in deterministic traversal order", async () => {
        const root = createRoot();
        const first = writePackage(root, "a/demo", "demo");
        const second = writePackage(root, "z/demo", "demo");
        const repository = new FsIntegrationDefinitionRepository(root);

        await expect(repository.list()).rejects.toThrow(
            `Duplicate integration kind "demo" in ${join(first, "integration.json")} and ${join(second, "integration.json")}`,
        );
    });

    test("requires the package leaf name to match its declared kind", async () => {
        const root = createRoot();
        writePackage(root, "providers/unexpected", "expected");
        const repository = new FsIntegrationDefinitionRepository(root);

        await expect(repository.list()).rejects.toThrow('index kind "expected" does not match directory "unexpected"');
    });

    test("rejects duplicate normalized version paths", async () => {
        const root = createRoot();
        writePackage(root, "demo", "demo", [
            { version: "1.0.0", path: "releases/current", definition: "releases/current/definition.json" },
            { version: "2.0.0", path: "releases/./current", definition: "releases/current/definition.json" },
        ]);
        const repository = new FsIntegrationDefinitionRepository(root);

        await expect(repository.list()).rejects.toThrow('duplicate version path "releases/./current"');
    });

    test("rejects structural directory and package manifest symlinks", async () => {
        const structuralRoot = createRoot();
        const outside = createRoot();
        symlinkSync(outside, join(structuralRoot, "providers"), "dir");

        await expect(new FsIntegrationDefinitionRepository(structuralRoot).list()).rejects.toThrow(
            /structure must not contain symlinks/,
        );

        const manifestRoot = createRoot();
        const packageRoot = join(manifestRoot, "demo");
        mkdirSync(packageRoot);
        const manifest = join(outside, "integration.json");
        writeIndex(manifest, "demo");
        symlinkSync(manifest, join(packageRoot, "integration.json"), "file");

        await expect(new FsIntegrationDefinitionRepository(manifestRoot).list()).rejects.toThrow(
            /integration\.json must be a regular file/,
        );
    });
});

type Version = { version: string; path: string; definition: string };

function createRoot(): string {
    return mkdtempSync(join(tmpdir(), "cms-integrations-discovery-"));
}

function writePackage(root: string, path: string, kind: string, versions?: Version[]): string {
    const packageRoot = join(root, path);
    mkdirSync(packageRoot, { recursive: true });
    writeIndex(join(packageRoot, "integration.json"), kind, versions);
    return packageRoot;
}

function writeIndex(path: string, kind: string, versions?: Version[]): void {
    writeFileSync(
        path,
        `${JSON.stringify({
            kind,
            label: kind,
            versions: versions ?? [
                { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
            ],
        })}\n`,
    );
}
