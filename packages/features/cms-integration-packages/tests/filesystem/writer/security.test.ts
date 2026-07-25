import { afterEach, describe, expect, test } from "bun:test";
import { access, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { cleanupWriterRoots, existingDirectory, packageInput, temporaryWriterParent, writerOptions } from "./fixtures";

afterEach(cleanupWriterRoots);

describe("immutable integration package directory confinement", () => {
    test("rejects an existing destination without changing it", async () => {
        const parent = await temporaryWriterParent();
        const destination = await existingDirectory(parent, "candidate");
        await writeFile(join(destination, "sentinel"), "owned by caller");
        const input = await packageInput();

        await expect(writeImmutableIntegrationPackageDirectory(input, writerOptions(parent, input))).rejects.toThrow(
            /must not already exist/,
        );

        expect(await readFile(join(destination, "sentinel"), "utf8")).toBe("owned by caller");
    });

    test("rejects symlink parents and destinations without touching their targets", async () => {
        const root = await temporaryWriterParent();
        const outside = await existingDirectory(root, "outside");
        const linkedParent = join(root, "linked-parent");
        await symlink(outside, linkedParent, "dir");
        const input = await packageInput();

        await expect(
            writeImmutableIntegrationPackageDirectory(input, {
                ...writerOptions(root, input),
                destination: join(linkedParent, "candidate"),
            }),
        ).rejects.toThrow(/parent must be a real non-symlink directory/);
        await expect(access(join(outside, "candidate"))).rejects.toThrow();

        const destinationTarget = await existingDirectory(root, "destination-target");
        await writeFile(join(destinationTarget, "sentinel"), "outside");
        await symlink(destinationTarget, join(root, "candidate"), "dir");
        await expect(writeImmutableIntegrationPackageDirectory(input, writerOptions(root, input))).rejects.toThrow(
            /must not already exist/,
        );
        expect(await readFile(join(destinationTarget, "sentinel"), "utf8")).toBe("outside");
    });

    test("revalidates path collisions before creating staging", async () => {
        const parent = await temporaryWriterParent();
        const envelope = {
            schema: "cms.integration.package.v1",
            kind: "writer-demo",
            version: "1.2.3",
            definition: "definition.json",
            releaseNotes: "release-notes.md",
            files: {
                "definition.json": { encoding: "utf8", content: "{}" },
                "release-notes.md": { encoding: "utf8", content: "# Release\n" },
                assets: { encoding: "utf8", content: "file collision" },
                "assets/icon.svg": { encoding: "utf8", content: "<svg/>" },
            },
        } as IntegrationPackageEnvelopeV1;
        const canonicalBytes = canonicalJsonBytes(envelope);
        const input = { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };

        await expect(writeImmutableIntegrationPackageDirectory(input, writerOptions(parent, input))).rejects.toThrow(
            /collides with a file/,
        );
        await expect(access(join(parent, "candidate"))).rejects.toThrow();
    });

    test("rejects expected identity disagreement before creating staging", async () => {
        const parent = await temporaryWriterParent();
        const input = await packageInput();
        const options = writerOptions(parent, input);

        await expect(
            writeImmutableIntegrationPackageDirectory(input, {
                ...options,
                expected: { ...options.expected, version: "2.0.0" },
            }),
        ).rejects.toThrow(/version must be "2.0.0"/);
        await expect(access(options.destination)).rejects.toThrow();

        await expect(
            writeImmutableIntegrationPackageDirectory(input, {
                ...options,
                expected: { ...options.expected, digest: "0".repeat(64) },
            }),
        ).rejects.toThrow(/digest does not match canonical content/);
        await expect(access(options.destination)).rejects.toThrow();
    });
});
