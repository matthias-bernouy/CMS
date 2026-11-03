import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { profileCliFixture } from "./fixture";

const version = "0.1.0";

test("fresh cached-image startup needs no registry pull while an explicit upgrade still pulls", async () => {
    const fixture = await profileCliFixture();
    try {
        await seedImages(fixture.root);
        const services = await fixture.run(["services", "start", "--version", version]);
        expect(services.stderr).toBe("");
        expect(services.exitCode).toBe(0);
        const instance = await fixture.run(["instance", "create", "registry", "--profile", "ulvia.repository@1.0.0"]);
        expect(instance.stderr).toBe("");
        expect(instance.exitCode).toBe(0);
        expect((await calls(fixture.root)).filter(({ args }) => args[0] === "pull")).toEqual([]);
        expect((await fixture.run(["upgrade", "provider", "--version", version])).exitCode).toBe(0);
        expect((await calls(fixture.root)).filter(({ args }) => args[0] === "pull").map(({ args }) => args)).toEqual([
            ["pull", `docker.io/cyaxis/ulvia-provider:${version}`],
        ]);
    } finally {
        await fixture.close();
    }
});

test("a mismatched cached image refuses startup before pulling or persisting a runtime pin", async () => {
    const fixture = await profileCliFixture();
    try {
        await seedImages(fixture.root, true);
        const result = await fixture.run(["services", "start", "--version", version]);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("not the official Ulvia provider");
        const invoked = await calls(fixture.root);
        expect(invoked.some(({ args }) => args[0] === "pull")).toBe(false);
        expect(invoked.some(({ args }) => args.includes("up"))).toBe(false);
        expect(await Bun.file(join(fixture.root, "data/services/stack.json")).exists()).toBe(false);
    } finally {
        await fixture.close();
    }
});

async function seedImages(root: string, mismatch = false) {
    const images: Record<string, unknown> = {};
    for (const component of ["provider", "edge"]) {
        const repository = `docker.io/cyaxis/ulvia-${component}`;
        const reference = `${repository}:${version}`;
        const digest = `sha256:${createHash("sha256").update(reference).digest("hex")}`;
        const image = {
            component: mismatch && component === "provider" ? "edge" : component,
            repository,
            version,
            digest,
        };
        images[reference] = image;
        images[`${repository}@${digest}`] = image;
    }
    await writeFile(join(root, "images.json"), JSON.stringify(images));
}

async function calls(root: string): Promise<{ args: string[] }[]> {
    return (await readFile(join(root, "calls.ndjson"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
}
