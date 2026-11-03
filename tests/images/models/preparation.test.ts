import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareModel } from "../../../infra/models/prepare";
import type { ModelRelease } from "../../../infra/models/prepare";

const release: ModelRelease = {
    model: "test/model",
    revision: "a".repeat(40),
    files: [{ path: "config.json", url: "https://model.test/config", bytes: 3, sha256: digest("abc") }],
};
function digest(text: string) {
    return createHash("sha256").update(text).digest("hex");
}

test("the image model manifest pins required files, checksums and license", async () => {
    const manifest = await Bun.file(resolve(import.meta.dir, "../../../infra/models/release.json")).json();
    expect(manifest.model).toBe("Xenova/multilingual-e5-small");
    expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/u);
    expect(manifest.license).toBe("MIT");
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "onnx/model_quantized.onnx",
        "LICENSE",
    ]);
    for (const file of manifest.files) {
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.url).toMatch(/^https:\/\//u);
    }
});

test("verified downloads survive layer invalidation without network and corrupt cache entries are repaired", async () => {
    const root = await mkdtemp(join(tmpdir(), "model-preparation-"));
    const destination = join(root, "output");
    const cache = join(root, "cache");
    let calls = 0;
    const request = async () => {
        calls++;
        return new Response("abc");
    };
    try {
        expect(await prepareModel(release, destination, cache, request)).toEqual({ downloaded: 1, reused: 0 });
        const offline = async () => {
            throw new Error("Network must not be used");
        };
        expect(await prepareModel(release, join(root, "rebuilt"), cache, offline)).toEqual({
            downloaded: 0,
            reused: 1,
        });
        await Bun.write(join(cache, release.files[0]!.sha256), "bad");
        expect(await prepareModel(release, destination, cache, request)).toEqual({ downloaded: 1, reused: 0 });
        expect(calls).toBe(2);
        expect(await Bun.file(join(destination, release.model, release.revision, "config.json")).text()).toBe("abc");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("bad downloads leave no reusable or published model and remain retryable", async () => {
    const root = await mkdtemp(join(tmpdir(), "model-integrity-"));
    const destination = join(root, "output");
    const cache = join(root, "cache");
    try {
        for (const body of ["ab", "bad", "abcd"]) {
            await expect(prepareModel(release, destination, cache, async () => new Response(body))).rejects.toThrow();
            expect(await readdir(cache)).toEqual([]);
            expect(await Bun.file(join(destination, "release.json")).exists()).toBe(false);
        }
        expect(await prepareModel(release, destination, cache, async () => new Response("abc"))).toEqual({
            downloaded: 1,
            reused: 0,
        });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
