import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "../../../../src/runtime/process";
export async function createTestCertificate(directory: string, hosts: readonly string[]) {
    await mkdir(directory);
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
        `/CN=${hosts[0]}`,
        "-addext",
        `subjectAltName=${hosts.map((host) => `DNS:${host}`).join(",")}`,
        "-keyout",
        join(directory, "site.key"),
        "-out",
        join(directory, "site.crt"),
    ]);
}
