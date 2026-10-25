import { expect, test } from "bun:test";
import { lstat, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { selectIdentity } from "../../../src/runtime/repository/identities";
import { readClientConfig } from "../../../src/runtime/repository/config";
import { identityFixture } from "./fixture";

test("login persists local identities and owner selection through claims, publication, rotation and logout", async () => {
    const f = await identityFixture();
    try {
        await f.run(["repository", "login", f.server.url.origin]);
        let config = await readClientConfig(f.config);
        expect(config.activeIdentity).toBe("default");
        expect(config.repository).toEqual({ url: f.server.url.origin, repositoryId: "test-repository" });
        const originalKey = await readFile(config.identities.default!.keyFile, "utf8");
        expect((await lstat(config.identities.default!.keyFile)).mode & 0o077).toBe(0);
        expect((await lstat(join(f.config, "config.json"))).mode & 0o077).toBe(0);
        await f.run(["namespace", "claim", "ulvia.official"]);
        const source = resolve(import.meta.dir, "../../../../../official-repository/contracts/ulvia.cms.emailer");
        await f.run(["release", source]);
        const definition = JSON.parse(await readFile(join(source, "definition.json"), "utf8"));
        const coordinate = `ulvia.official/${definition.contractId}@${definition.version}`;
        await f.run(["identity", "create", "next"]);
        await f.run(["identity", "use", "next"]);
        await f.run(["push", "contract", coordinate]);
        await f.run(["namespace", "rotate", "ulvia.official", "--replacement-identity", "next"]);
        expect((await f.authority.get("ulvia.official"))?.revision).toBe(2);
        await f.run(["identity", "use", "default"]);
        await f.run(["yank", "contract", coordinate, "--reason", "Test rotation"]);
        await f.run(["restore", "contract", coordinate]);
        await f.run(["repository", "logout"]);
        config = await readClientConfig(f.config);
        expect(config.repository).toBeUndefined();
        expect(Object.keys(config.identities)).toEqual(["default", "next"]);
        expect(f.output.join("\n")).not.toContain(originalKey);
        expect(await readFile(join(f.config, "config.json"), "utf8")).not.toContain("PRIVATE KEY");
    } finally {
        await f.close();
    }
});

test("lost identity keys are never regenerated and importing preserves private-file protections", async () => {
    const f = await identityFixture();
    try {
        await f.run(["repository", "login", f.server.url.origin]);
        const config = await readClientConfig(f.config);
        const keyFile = config.identities.default!.keyFile;
        const privateKey = await readFile(keyFile, "utf8");
        await f.run(["identity", "import", "backup", "--key-file", keyFile]);
        expect((await readClientConfig(f.config)).identities.backup!.publicKey).toBe(
            config.identities.default!.publicKey,
        );
        await expect(f.run(["identity", "create", "default"])).rejects.toThrow("already exists");
        const link = join(f.root, "key-link.pem");
        await symlink(keyFile, link);
        await expect(f.run(["identity", "import", "linked", "--key-file", link])).rejects.toThrow();
        await writeFile(join(f.root, "unsafe.pem"), privateKey, { mode: 0o644 });
        await expect(f.run(["identity", "import", "unsafe", "--key-file", join(f.root, "unsafe.pem")])).rejects.toThrow(
            "private regular",
        );
        await rm(keyFile);
        expect((await selectIdentity(f.config, undefined, config.identities.default!.publicKey)).keyFile).toBe(
            (await readClientConfig(f.config)).identities.backup!.keyFile,
        );
        await expect(f.run(["repository", "login", f.server.url.origin])).rejects.toThrow();
        expect(await Bun.file(keyFile).exists()).toBe(false);
    } finally {
        await f.close();
    }
});

test("saved Repository identity cannot silently change on login or namespace writes", async () => {
    const f = await identityFixture();
    try {
        await f.run(["repository", "login", f.server.url.origin]);
        const path = join(f.config, "config.json");
        const config = await readClientConfig(f.config);
        config.repository!.repositoryId = "another-repository";
        await writeFile(path, JSON.stringify(config), { mode: 0o600 });
        await expect(f.run(["repository", "login", f.server.url.origin])).rejects.toThrow("identity changed");
        await expect(f.run(["namespace", "claim", "acme"])).rejects.toThrow("identity changed");
        expect(await f.authority.get("acme")).toBeNull();
    } finally {
        await f.close();
    }
});
