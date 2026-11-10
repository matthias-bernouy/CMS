import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceStackRelease } from "../../../src/runtime/stack/releases/local";
import { parseStackRelease, releaseDigest } from "../../../src/runtime/stack/releases/model";
import { downloadStackRelease, extractRelease } from "../../../src/runtime/stack/releases/download";
import { assertInfrastructureUpgrade } from "../../../src/runtime/stack/orchestration/deployment/execute";
import type { LocalServicesState } from "../../../src/runtime/stack/orchestration/state";

const version = "0.2.0";

test("release content, exact file inventory, version and infrastructure digest pins are validated", async () => {
    const release = await sourceStackRelease(version);
    expect(parseStackRelease(release)).toEqual(release);
    expect(() => parseStackRelease({ ...release, files: { ...release.files, "services.yml": "changed" } })).toThrow(
        "digest",
    );
    expect(() => parseStackRelease({ ...release, version: "latest" })).toThrow("Invalid Ulvia image version");
    const unpinned = {
        ...release,
        files: {
            ...release.files,
            "services.yml": release.files["services.yml"].replace(/@sha256:[a-f0-9]{64}/gu, ""),
        },
    };
    expect(() => parseStackRelease({ ...unpinned, digest: releaseDigest(unpinned) })).toThrow("pin caddy");
    const state = { release } as LocalServicesState;
    const major = {
        ...release,
        files: {
            ...release.files,
            "services.yml": release.files["services.yml"].replace("mongo:7.0.37", "mongo:8.0.0"),
        },
    };
    expect(() => assertInfrastructureUpgrade(state, { release: major } as LocalServicesState)).toThrow(
        "data migration",
    );
});

test("official npm release download binds metadata, URL, integrity and inner stack version", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-release-archive-"));
    try {
        await mkdir(join(root, "package/dist"), { recursive: true });
        await writeFile(
            join(root, "package/dist/stack-release.json"),
            JSON.stringify(await sourceStackRelease(version)),
        );
        const process = Bun.spawn(["tar", "-czf", join(root, "release.tgz"), "-C", root, "package"], {
            stdout: "ignore",
            stderr: "inherit",
        });
        expect(await process.exited).toBe(0);
        const bytes = new Uint8Array(await Bun.file(join(root, "release.tgz")).arrayBuffer());
        const tarball = `https://registry.npmjs.org/@cyaxis/ulvia/-/ulvia-${version}.tgz`;
        let metadata = {
            name: "@cyaxis/ulvia",
            version,
            dist: { tarball, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` },
        };
        const calls: string[] = [];
        const request = (async (url, init) => {
            calls.push(String(url));
            expect(init?.redirect).toBe("manual");
            return String(url) === tarball ? new Response(bytes) : Response.json(metadata);
        }) as typeof fetch;
        expect((await downloadStackRelease(version, request)).version).toBe(version);
        metadata = { ...metadata, dist: { ...metadata.dist, tarball: "https://foreign.example/release.tgz" } };
        const before = calls.length;
        await expect(downloadStackRelease(version, request)).rejects.toThrow("foreign");
        expect(calls.length - before).toBe(1);
        metadata = { ...metadata, dist: { tarball, integrity: `sha512-${Buffer.alloc(64).toString("base64")}` } };
        await expect(downloadStackRelease(version, request)).rejects.toThrow("integrity mismatch");
        expect(() => extractRelease(new Uint8Array([1, 2, 3]))).toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
