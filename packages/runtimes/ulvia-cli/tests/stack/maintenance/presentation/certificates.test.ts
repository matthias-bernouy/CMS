import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCommand } from "../../../../src/runtime/process";
import { copyPresentationCertificates } from "../../../../src/runtime/maintenance/presentation/certificates";

test("only matching TLS pairs are copied privately, missing certificates and symlinks refuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-maintenance-cert-"));
    try {
        await mkdir(join(root, "source"));
        await runCommand([
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "1",
            "-subj",
            "/CN=site.localhost",
            "-addext",
            "subjectAltName=DNS:site.localhost",
            "-keyout",
            join(root, "source/site.key"),
            "-out",
            join(root, "source/site.crt"),
        ]);
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
