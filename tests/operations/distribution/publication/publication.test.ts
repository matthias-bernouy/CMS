import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publicationFixture } from "./fixture";

test("runtime publishes images and CLI without contacting the Repository or promoting npm", async () => {
    const f = await publicationFixture();
    try {
        f.setFailure("repository-preflight");
        await f.publish("runtime");
        expect(f.calls).not.toContain("repository-preflight");
        expect(f.calls).not.toContain("npm --version");
        expect(f.calls).not.toContain("catalogue");
        expect(f.calls).not.toContain("promotion");
        expect(f.remote.size).toBe(2);
        expect(f.promoted()).toBe(false);
    } finally {
        await f.close();
    }
});

test("an old receiver can refuse the catalogue after runtime publication, then resume without republishing runtime", async () => {
    const f = await publicationFixture();
    try {
        f.setFailure("catalogue");
        await expect(f.publish()).rejects.toThrow("Runtime is published");
        expect(f.calls).not.toContain("promotion");
        expect(f.calls.indexOf("cli")).toBeLessThan(f.calls.indexOf("catalogue"));
        f.calls.length = 0;
        f.setFailure("");
        f.dependencies.images = async () => {
            throw new Error("No local Docker images in catalogue phase");
        };
        await f.publish("catalogue");
        expect(f.calls).not.toContain("cli");
        expect(f.calls.some((call) => call.startsWith("push-"))).toBe(false);
        expect(f.calls.indexOf("catalogue")).toBeLessThan(f.calls.indexOf("promotion"));
        expect(f.promoted()).toBe(true);
    } finally {
        await f.close();
    }
});

test("catalogue refuses missing runtime before contacting the Repository", async () => {
    const f = await publicationFixture();
    try {
        await expect(f.publish("catalogue")).rejects.toThrow("runtime images missing");
        expect(f.calls).not.toContain("repository-preflight");
        expect(f.calls).not.toContain("promotion");
    } finally {
        await f.close();
    }
});

test.each(["edge", "provider", "cli", "promotion"])(
    "%s interruption resumes from observed remote state",
    async (failure) => {
        const f = await publicationFixture();
        try {
            f.setFailure(failure);
            await expect(f.publish()).rejects.toThrow();
            const alreadyPublished = new Set(f.remote);
            f.calls.length = 0;
            f.setFailure("");
            await f.publish(failure === "promotion" ? "catalogue" : "all");
            for (const component of alreadyPublished) {
                expect(f.calls).not.toContain(`push-${component}`);
            }
            expect(f.promoted()).toBe(true);
        } finally {
            await f.close();
        }
    },
);

test.each(["archive", "catalogue", "extra-file", "special-file", "image", "npm-preflight", "images-preflight"])(
    "%s preflight refusal leaves remote state unchanged",
    async (failure) => {
        const f = await publicationFixture();
        try {
            if (failure === "archive") {
                await writeFile(f.archive, "tampered");
            }
            if (failure === "catalogue") {
                const path = join(f.destination, "repository/contracts/example/simple/1.0.0.json");
                await writeFile(path, JSON.stringify({ ...JSON.parse(await readFile(path, "utf8")), name: "Changed" }));
            }
            if (failure === "extra-file" || failure === "special-file") {
                await writeFile(
                    join(f.destination, "repository", failure === "special-file" ? "__proto__" : "extra"),
                    "extra",
                );
            }
            if (failure === "image") {
                f.dependencies.images = async () => [{ ...f.images[0]!, id: `sha256:${"c".repeat(64)}` }, f.images[1]!];
            }
            f.setFailure(failure);
            await expect(f.publish()).rejects.toThrow();
            expect(f.remote.size).toBe(0);
            expect(f.calls).not.toContain("cli");
            expect(f.calls).not.toContain("promotion");
        } finally {
            await f.close();
        }
    },
);

test("changed artifacts during preflight cannot enter the runtime publication", async () => {
    const f = await publicationFixture();
    try {
        const original = f.dependencies.npm;
        f.dependencies.npm = async (...args) => {
            const result = await original(...args);
            await writeFile(f.archive, "changed");
            return result;
        };
        await expect(f.publish()).rejects.toThrow("modified build");
        expect(f.remote.size).toBe(0);
    } finally {
        await f.close();
    }
});

test("runtime disappearance during catalogue publication prevents npm promotion", async () => {
    const f = await publicationFixture();
    try {
        const original = f.dependencies.repository;
        f.dependencies.repository = async (...args) => {
            const repository = await original(...args);
            return {
                ...repository,
                publish: async (log) => {
                    await repository.publish(log);
                    f.remote.clear();
                },
            };
        };
        await expect(f.publish()).rejects.toThrow("runtime images missing");
        expect(f.calls).toContain("catalogue");
        expect(f.calls).not.toContain("promotion");
        expect(f.promoted()).toBe(false);
    } finally {
        await f.close();
    }
});
