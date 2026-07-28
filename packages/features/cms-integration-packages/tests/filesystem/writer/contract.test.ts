import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { access, lstat, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { cleanupWriterRoots, packageInput, temporaryWriterParent, writerOptions } from "./fixtures";

afterEach(cleanupWriterRoots);

describe("immutable integration package directory writer", () => {
    test("writes a directly publishable root and reproduces its canonical digest", async () => {
        const parent = await temporaryWriterParent();
        const input = await packageInput();

        const written = await writeImmutableIntegrationPackageDirectory(input, writerOptions(parent, input));

        expect(written.root).toBe(join(parent, "candidate"));
        expect(written.digest).toBe(input.digest);
        expect(written.canonicalBytes).toEqual(input.canonicalBytes);
        expect(written.envelope).toEqual(input.envelope);
        expect(await readFile(join(written.root, "definition.json"), "utf8")).toContain('"label":"Crème"');
        expect(await readFile(join(written.root, "release-notes.md"), "utf8")).toContain("été");
        expect((await readdir(written.root)).sort()).toEqual(["assets", "definition.json", "release-notes.md"]);
        await expect(access(join(written.root, "package.json"))).rejects.toThrow();
    });

    test("preserves opaque binary bytes represented as canonical base64", async () => {
        const parent = await temporaryWriterParent();
        const binary = Uint8Array.from([0, 255, 128, 254, 1]);
        const input = await packageInput({
            files: {
                "definition.json": { encoding: "utf8", content: '{"kind":"writer-demo","version":"1.2.3"}' },
                "release-notes.md": { encoding: "utf8", content: "# Binary release\n" },
                "assets/payload.bin": { encoding: "base64", content: Buffer.from(binary).toString("base64") },
            },
        });

        const written = await writeImmutableIntegrationPackageDirectory(input, writerOptions(parent, input));

        expect(await readFile(join(written.root, "assets/payload.bin"))).toEqual(binary);
        expect(written.envelope.files["assets/payload.bin"]).toEqual(input.envelope.files["assets/payload.bin"]);
    });

    test("sets immutable modes without changing the writable staging parent", async () => {
        const parent = await temporaryWriterParent();
        const input = await packageInput();
        const parentMode = (await stat(parent)).mode & 0o777;

        const written = await writeImmutableIntegrationPackageDirectory(input, writerOptions(parent, input));

        expect((await stat(written.root)).mode & 0o777).toBe(0o550);
        expect((await stat(join(written.root, "assets"))).mode & 0o777).toBe(0o550);
        expect((await stat(join(written.root, "definition.json"))).mode & 0o777).toBe(0o440);
        expect((await stat(join(written.root, "assets/icon.svg"))).mode & 0o777).toBe(0o440);
        expect((await stat(parent)).mode & 0o777).toBe(parentMode);
        expect((await lstat(written.root)).isSymbolicLink()).toBe(false);
    });
});
