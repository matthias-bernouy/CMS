import { expect, test } from "bun:test";
import { readFile, rename, symlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { completeReceipt, readReceipt, receiptPath } from "../../../infra/distribution/receipt";
import { inspectImages } from "../../../infra/images/inspection";
import { distributionVersion } from "../../../infra/distribution/options";
import { distributionFixture } from "./fixture";

test("the existing CLI receipt binds the complete build without a separate manifest", async () => {
    const f = await distributionFixture();
    try {
        expect(await readReceipt(f.destination, f.version)).toEqual(f.receipt);
        expect(await Bun.file(join(f.destination, "manifest.json")).exists()).toBe(false);
        expect(f.receipt).not.toHaveProperty("schema");
        expect(f.receipt).not.toHaveProperty("files");
        expect(f.receipt).not.toHaveProperty("resources");
        expect(f.receipt.catalogueSha256).toMatch(/^[a-f0-9]{64}$/u);
        await writeFile(receiptPath(f.destination, f.version), JSON.stringify({ ...f.receipt, version: "2.0.0" }));
        await expect(readReceipt(f.destination, f.version)).rejects.toThrow("Invalid or modified");
    } finally {
        await f.close();
    }
});

test("symlinked artifacts cannot substitute external bytes", async () => {
    const f = await distributionFixture();
    try {
        await symlink(f.archive, join(f.destination, "repository/foreign"));
        await expect(readReceipt(f.destination, f.version)).rejects.toThrow("Symbolic");
    } finally {
        await f.close();
    }
});

test("image version, component, revision and content identity must match", async () => {
    const f = await distributionFixture();
    try {
        const inspect =
            (patch: Record<string, string> = {}, id?: string) =>
            async (args: readonly string[]) => {
                const component = args.at(-1)!.includes("ulvia-edge") ? "edge" : "provider";
                return JSON.stringify([
                    {
                        Id: id ?? f.images.find((image) => image.component === component)!.id,
                        Config: {
                            Labels: {
                                "io.ulvia.component": component,
                                "io.ulvia.stack-api": "1",
                                "io.ulvia.hosting-api": "1",
                                "org.opencontainers.image.version": f.version,
                                "org.opencontainers.image.revision": f.revision,
                                ...patch,
                            },
                        },
                    },
                ]);
            };
        expect(await inspectImages(f.version, f.revision, inspect())).toEqual(f.images);
        for (const key of [
            "io.ulvia.component",
            "io.ulvia.stack-api",
            "io.ulvia.hosting-api",
            "org.opencontainers.image.version",
            "org.opencontainers.image.revision",
        ]) {
            await expect(inspectImages(f.version, f.revision, inspect({ [key]: "wrong" }))).rejects.toThrow(
                "mismatched",
            );
        }
        await expect(inspectImages(f.version, f.revision, inspect({}, "invalid"))).rejects.toThrow("mismatched");
    } finally {
        await f.close();
    }
});

test("invalid distribution arguments fail before any work", () => {
    expect(distributionVersion([], false)).toBeUndefined();
    for (const args of [
        [],
        ["--version"],
        ["--version", "../other"],
        ["--version", "01.2.3"],
        ["--version", "1.2.3-01"],
        ["--version", "1.2.3", "extra"],
    ]) {
        expect(() => distributionVersion(args, true)).toThrow("Usage:");
    }
});

test("internal builders reject the same malformed versions before building artifacts", async () => {
    for (const entry of ["infra/cli/build.ts", "infra/images/build.ts"]) {
        for (const version of ["01.2.3", "1.2.3-01"]) {
            const child = Bun.spawn(
                [process.execPath, resolve(import.meta.dir, "../../..", entry), "build", "--version", version],
                {
                    stdout: "pipe",
                    stderr: "pipe",
                },
            );
            const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
            expect(code).not.toBe(0);
            expect(error).toContain(`Usage: bun run ${entry} build --version`);
        }
    }
});

test("catalogue paths are part of the fingerprint and incomplete builds refuse publication", async () => {
    const f = await distributionFixture();
    try {
        const { images, catalogueSha256, ...partial } = f.receipt;
        await writeFile(receiptPath(f.destination, f.version), JSON.stringify(partial));
        await expect(readReceipt(f.destination, f.version)).rejects.toThrow("Invalid or modified");
        await writeFile(receiptPath(f.destination, f.version), JSON.stringify(f.receipt));
        const path = join(f.destination, "repository/contracts/example/simple/1.0.0.json");
        await rename(path, `${path}.moved`);
        await expect(readReceipt(f.destination, f.version)).rejects.toThrow("Invalid or modified");
    } finally {
        await f.close();
    }
});

test.each(["file", "directory"])("symbolic %s cannot redirect receipt reads or writes", async (kind) => {
    const f = await distributionFixture();
    try {
        const path = kind === "file" ? receiptPath(f.destination, f.version) : join(f.destination, "cli");
        const external = join(f.root, "external");
        await rename(path, external);
        await symlink(external, path);
        const externalReceipt =
            kind === "file" ? external : join(external, basename(receiptPath(f.destination, f.version)));
        const before = await readFile(externalReceipt);
        await expect(readReceipt(f.destination, f.version)).rejects.toThrow("regular file");
        await expect(completeReceipt(f.destination, f.version, f.revision, [])).rejects.toThrow("regular file");
        expect(await readFile(externalReceipt)).toEqual(before);
    } finally {
        await f.close();
    }
});

test.each(["component", "origin", "identity"])(
    "catalogue publication refuses forged %s evidence before any registry request",
    async (mode) => {
        const f = await distributionFixture();
        try {
            const images = [...f.images];
            images[0] = {
                ...images[0]!,
                ...(mode === "component"
                    ? { component: "provider" as const }
                    : mode === "origin"
                      ? { reference: "docker.io/foreign/image:1.2.3" }
                      : { id: "sha256:invalid" }),
            };
            await writeFile(receiptPath(f.destination, f.version), JSON.stringify({ ...f.receipt, images }));
            await expect(readReceipt(f.destination, f.version)).rejects.toThrow("Invalid or modified");
        } finally {
            await f.close();
        }
    },
);
