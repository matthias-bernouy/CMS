import { expect, test } from "bun:test";
import { materialFixture, authenticationDocument, runtimeSecrets } from "./fixture";

const selector = { field: "accessTokenHash" as const, value: authenticationDocument().accessTokenHash };

for (const revoked of ["credential", "instance", "deleted"] as const) {
    test(`revocation of ${revoked} while decrypting fails closed`, async () => {
        const f = materialFixture();
        f.decrypt = async () => {
            if (revoked === "credential") {
                f.document!.enabled = false;
            }
            if (revoked === "instance") {
                f.document!.instance.status = "disabled";
            }
            if (revoked === "deleted") {
                f.document = null;
            }
            return JSON.stringify(runtimeSecrets);
        };
        expect(await f.reader.read(selector)).toBeNull();
        expect(f.reads).toBe(2);
    });
}

test("rotation during decryption reloads the changed material and bounds retries", async () => {
    const f = materialFixture();
    f.decrypt = async () => {
        if (f.decrypts === 1) {
            f.document!.secret.ciphertext = Buffer.from("rotated");
            f.document!.revision++;
            return JSON.stringify(runtimeSecrets);
        }
        return JSON.stringify({ ...runtimeSecrets, invocationSecret: "X".repeat(43) });
    };
    expect((await f.reader.read(selector))?.secrets.invocationSecret).toBe("X".repeat(43));
    expect(f.reads).toBe(3);
    expect(f.decrypts).toBe(2);
    const unstable = materialFixture();
    unstable.decrypt = async () => {
        unstable.document!.revision++;
        return JSON.stringify(runtimeSecrets);
    };
    await expect(unstable.reader.read(selector)).rejects.toThrow("changed during loading");
    expect(unstable.reads).toBe(3);
    expect(unstable.decrypts).toBe(2);
});

test("invalid or unreadable rotated secrets cannot fall back to previous decrypted values", async () => {
    const f = materialFixture();
    await f.reader.read(selector);
    f.document!.secret.ciphertext = Buffer.from("corrupt");
    f.decrypt = async () => {
        throw new Error("decrypt failed");
    };
    await expect(f.reader.read(selector)).rejects.toThrow("decrypt failed");
    f.decrypt = async () => "not-json-secret-value";
    await expect(f.reader.read(selector)).rejects.toThrow("Stored Provider instance credentials are invalid");
    f.decrypt = async () => JSON.stringify({ ...runtimeSecrets, extra: "invalid" });
    await expect(f.reader.read(selector)).rejects.toThrow("Stored Provider instance credentials are invalid");
});
