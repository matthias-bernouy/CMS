import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPages } from "../../../../src/runtime/maintenance/presentation/model";

test("maintenance manifest keeps canonical international domains and rejects cross-site host collisions and unsafe headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-pages-manifest-"));
    const sites = [
        { id: "a".repeat(64), hosts: ["xn--caf-dma.example", "shop--one.example"], resources: ["text/css"] },
    ];
    const write = (value: unknown) => writeFile(join(root, "pages.json"), JSON.stringify(value), { mode: 0o600 });
    try {
        const value = { schema: "ulvia.maintenance-pages/v1", sites, tlsHosts: ["xn--caf-dma.example"] };
        await write(value);
        expect(await readPages(root)).toEqual(value);
        await write({ ...value, sites: [...sites, { ...sites[0], id: "b".repeat(64) }] });
        await expect(readPages(root)).rejects.toThrow("domain");
        await write({ ...value, tlsHosts: ["other.example"] });
        await expect(readPages(root)).rejects.toThrow("TLS");
        await write({ ...value, sites: [{ ...sites[0], resources: ["image/png\r\nSet-Cookie: secret"] }] });
        await expect(readPages(root)).rejects.toThrow("site");
        await write({ ...value, sites: [{ ...sites[0], hosts: ["*.example"] }] });
        await expect(readPages(root)).rejects.toThrow("domain");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
