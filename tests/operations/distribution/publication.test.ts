import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publishDistribution } from "../../../infra/distribution/publish";
import type { PublicationPorts } from "../../../infra/distribution/publish";
import { distributionFixture } from "./fixture";

async function fixture() {
    const f = await distributionFixture();
    const calls: string[] = [];
    let fail = "";
    const dependencies: PublicationPorts = {
        images: async () => {
            calls.push("inspect");
            return f.images;
        },
        repository: async (root) => {
            expect(root).toBe(join(f.destination, "repository"));
            calls.push("repository-preflight");
            return {
                url: "https://repository.example",
                coordinates: f.manifest.resources,
                publish: async () => {
                    calls.push("contracts");
                    if (fail === "contracts") {
                        throw new Error("contracts");
                    }
                },
            };
        },
        npm: async (archive) => {
            expect(archive).toBe(f.archive);
            calls.push("npm-preflight");
            if (fail === "npm-preflight") {
                throw new Error("npm conflict");
            }
            return async () => {
                calls.push("cli");
            };
        },
        run: async (args) => {
            calls.push(args.join(" "));
            if (fail === "image") {
                throw new Error("image push failed");
            }
            return "";
        },
    };
    return {
        ...f,
        calls,
        dependencies,
        setFailure: (value: string) => {
            fail = value;
        },
        publish: () => publishDistribution(f.root, f.version, {}, dependencies),
    };
}

test("all artifacts and publishers are checked before ordered publication; identical retry resumes", async () => {
    const f = await fixture();
    try {
        f.setFailure("image");
        await expect(f.publish()).rejects.toThrow("image push failed");
        expect(f.calls).toEqual([
            "inspect",
            "repository-preflight",
            "npm-preflight",
            "contracts",
            `docker push ${f.images[0]!.reference}`,
        ]);
        f.calls.length = 0;
        f.setFailure("");
        await f.publish();
        expect(f.calls).toEqual([
            "inspect",
            "repository-preflight",
            "npm-preflight",
            "contracts",
            ...f.images.map((image) => `docker push ${image.reference}`),
            "cli",
        ]);
    } finally {
        await f.close();
    }
});

test.each(["archive", "extra-file", "image", "npm-preflight", "contracts"])(
    "%s refusal stops all later writes",
    async (failure) => {
        const f = await fixture();
        try {
            if (failure === "archive") {
                await writeFile(f.archive, "tampered");
            }
            if (failure === "extra-file") {
                await writeFile(join(f.destination, "repository/extra"), "unrelated cached release");
            }
            if (failure === "image") {
                f.dependencies.images = async () => [{ ...f.images[0]!, id: `sha256:${"c".repeat(64)}` }, f.images[1]!];
            }
            f.setFailure(failure);
            await expect(f.publish()).rejects.toThrow();
            expect(f.calls).not.toContain("cli");
            expect(f.calls.some((call) => call.startsWith("docker push"))).toBe(false);
            if (failure !== "contracts") {
                expect(f.calls).not.toContain("contracts");
            }
        } finally {
            await f.close();
        }
    },
);

test("a changed artifact during remote preflight is refused before any write", async () => {
    const f = await fixture();
    try {
        f.dependencies.npm = async () => {
            await writeFile(f.archive, "changed during preflight");
            return async () => {
                f.calls.push("cli");
            };
        };
        await expect(f.publish()).rejects.toThrow("modified distribution");
        expect(f.calls).not.toContain("contracts");
    } finally {
        await f.close();
    }
});
