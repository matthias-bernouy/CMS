import { createTestCertificate } from "./fixture";
import { expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, symlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyPresentationCertificates } from "../../../../src/runtime/maintenance/presentation/certificates";

test("only matching TLS pairs are copied privately, missing certificates and symlinks refuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-maintenance-cert-"));
    try {
        await createTestCertificate(join(root, "source"), ["site.localhost"]);
        await writeFile(join(root, "source/account.json"), "ACME account secret");
        expect(await copyPresentationCertificates(join(root, "source"), join(root, "copy"), ["site.localhost"])).toBe(
            1,
        );
        expect(await readFile(join(root, "copy/0.crt"), "utf8")).toContain("BEGIN CERTIFICATE");
        expect((await stat(join(root, "copy/0.key"))).mode & 0o777).toBe(0o600);
        expect(await Bun.file(join(root, "copy/account.json")).exists()).toBe(false);
        await expect(
            copyPresentationCertificates(join(root, "source"), join(root, "missing"), ["other.localhost"]),
        ).rejects.toThrow("every ready domain");
        await symlink(join(root, "source/site.crt"), join(root, "source/alias.crt"));
        await expect(
            copyPresentationCertificates(join(root, "source"), join(root, "unsafe"), ["site.localhost"]),
        ).rejects.toThrow("Unsafe");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
