import { expect, test } from "bun:test";
import { writeZip } from "@bernouy/zip";
import { sha256Digest } from "@bernouy/binary-media";
import { readResourceArchive, writeResourceArchive } from "../src/exports";
import { documentFixture, blocFixture, uncheckedArchive } from "./fixtures";

test("preserves ordinary compiled resources without an installed release identity", async () => {
    const bytes = new TextEncoder().encode("Hello");
    const asset = {
        namespace: "acme/base",
        id: "hello.txt",
        entry: "assets/hello.txt",
        mediaType: "text/plain",
        byteLength: bytes.length,
        digest: await sha256Digest(bytes),
    };
    const document = {
        ...documentFixture(),
        blocs: [blocFixture()],
        assets: [asset],
        pages: [
            {
                path: "/welcome",
                title: "Welcome",
                description: "",
                html: '<div cms-bloc="sample-card">Hello</div>',
                visible: true,
                indexing: false,
            },
        ],
    };
    const built = await writeResourceArchive({ document, assets: [{ path: asset.entry, bytes }] });
    const decoded = await readResourceArchive(built.bytes, { expectedDigest: built.digest });
    expect(decoded.document).toEqual(document);
    expect(await decoded.assets[0]?.bytes.text()).toBe("Hello");
    expect(Object.isFrozen(decoded.document.blocs[0])).toBe(true);
    const repeated = await writeResourceArchive({ document, assets: [{ path: asset.entry, bytes }] });
    expect(repeated.digest).toBe(built.digest);
    expect(decoded.document).not.toHaveProperty("version");
    expect(decoded.document).not.toHaveProperty("dependencies");
});

test("archive verification never executes browser artifacts", async () => {
    const document = {
        ...documentFixture(),
        blocs: [blocFixture({ viewJS: "throw new Error('browser code executed');" })],
    };
    const built = await writeResourceArchive({ document, assets: [] });
    expect(built.document.blocs[0]?.viewJS).toContain("browser code executed");
    await expect(
        writeResourceArchive({ document: { ...document, blocs: [blocFixture({ viewJS: "function {" })] }, assets: [] }),
    ).rejects.toBeInstanceOf(SyntaxError);
});

test("requires the exact expected archive digest and mandatory metadata fields", async () => {
    const built = await writeResourceArchive({ document: documentFixture(), assets: [] });
    await expect(readResourceArchive(built.bytes, { expectedDigest: `sha256:${"0".repeat(64)}` })).rejects.toThrow(
        "digest mismatch",
    );
    await expect(readResourceArchive(built.bytes, { expectedDigest: "not a digest" })).rejects.toThrow(
        "invalid expected digest",
    );
    const { theme: _theme, ...incomplete } = documentFixture();
    await expect(writeResourceArchive({ document: incomplete, assets: [] })).rejects.toBeInstanceOf(Error);
    await expect(
        writeResourceArchive({ document: { ...documentFixture(), version: "1.0.0" }, assets: [] }),
    ).rejects.toBeInstanceOf(Error);
});

test("refuses missing or undeclared asset files", async () => {
    const bytes = new TextEncoder().encode("payload");
    const asset = {
        namespace: "acme/base",
        id: "file.txt",
        entry: "assets/file.txt",
        mediaType: "text/plain",
        byteLength: bytes.length,
        digest: await sha256Digest(bytes),
    };
    const missing = await uncheckedArchive({ ...documentFixture(), assets: [asset] });
    await expect(readResourceArchive(missing.bytes, missing)).rejects.toThrow("missing");
    const extra = await uncheckedArchive(documentFixture(), [{ path: "assets/hidden.js", bytes }]);
    await expect(readResourceArchive(extra.bytes, extra)).rejects.toThrow("undeclared");
});

test("verifies each asset digest, size, signature and inline SVG profile", async () => {
    const bytes = new TextEncoder().encode("payload");
    const base = {
        namespace: "acme/base",
        id: "file.txt",
        entry: "assets/file.txt",
        mediaType: "text/plain",
        byteLength: bytes.length,
        digest: await sha256Digest(bytes),
    };
    for (const asset of [
        { ...base, digest: `sha256:${"0".repeat(64)}` },
        { ...base, byteLength: 1 },
        { ...base, mediaType: "image/png" },
        { ...base, profiles: ["inline-svg"] },
    ]) {
        const fixture = await uncheckedArchive({ ...documentFixture(), assets: [asset] }, [
            { path: base.entry, bytes },
        ]);
        await expect(readResourceArchive(fixture.bytes, fixture)).rejects.toBeInstanceOf(Error);
    }
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const fixture = await uncheckedArchive(
        {
            ...documentFixture(),
            assets: [
                {
                    ...base,
                    mediaType: "image/svg+xml",
                    byteLength: svg.length,
                    digest: await sha256Digest(svg),
                    profiles: ["inline-svg"],
                },
            ],
        },
        [{ path: base.entry, bytes: svg }],
    );
    await expect(readResourceArchive(fixture.bytes, fixture)).rejects.toBeInstanceOf(Error);
});

test("snapshots archive bytes, caller options and build metadata before yielding", async () => {
    const source = documentFixture();
    const pending = writeResourceArchive({ document: source, assets: [] });
    Object.assign(source, { format: "changed" });
    const built = await pending;
    const bytes = new Uint8Array(await built.bytes.arrayBuffer());
    const options = { expectedDigest: built.digest, limits: { maxArchiveBytes: 4096 } };
    const read = readResourceArchive(bytes, options);
    bytes.fill(0);
    options.expectedDigest = `sha256:${"0".repeat(64)}`;
    options.limits.maxArchiveBytes = 1;
    expect((await read).digest).toBe(built.digest);
});

test("lowered byte limits and cancellation refuse verification", async () => {
    const built = await writeResourceArchive({ document: documentFixture(), assets: [] });
    await expect(
        readResourceArchive(built.bytes, { expectedDigest: built.digest, limits: { maxArchiveBytes: 1 } }),
    ).rejects.toThrow("exceeds");
    const controller = new AbortController();
    const reason = new Error("caller canceled");
    const pending = readResourceArchive(built.bytes, { expectedDigest: built.digest, signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
});

test("rejects duplicate JSON keys, unsupported fields and malformed UTF-8 before returning data", async () => {
    for (const metadata of [
        '{"format":"ulvia-resources/v1","format":"ulvia-resources/v1"}',
        new Uint8Array([0xff, 0xfe]),
    ]) {
        const bytes = await writeZip([{ path: "resources.json", bytes: metadata }]);
        const expectedDigest = await sha256Digest(new Uint8Array(await bytes.arrayBuffer()));
        await expect(readResourceArchive(bytes, { expectedDigest })).rejects.toBeInstanceOf(Error);
    }
});
