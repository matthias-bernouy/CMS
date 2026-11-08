import { writeSdkContractFixture } from "../../authoredContractFixture";
import { expect, test } from "bun:test";
import { lstat, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCli } from "../../../src/cli";
import { readClientConfig } from "../../../src/runtime/repository/config";
import { accountFixture } from "./fixture";

test("CLI login, publication, transfer and suspension use the authenticated account without granting administrator rights", async () => {
    const f = await accountFixture();
    try {
        await f.run(["repository", "login", f.server.url.origin]);
        const config = await readClientConfig(f.config);
        expect(config.repository).toMatchObject({ url: f.server.url.origin, repositoryId: f.application.repositoryId });
        expect((await lstat(join(f.config, "config.json"))).mode & 0o077).toBe(0);
        await f.run(["namespace", "claim", "ulvia"]);
        const source = await writeSdkContractFixture(join(f.root, "sources", "cms.emailer"), "ulvia/cms.emailer");
        await f.run(["release", source]);
        const definition = JSON.parse(await readFile(join(source, "definition.json"), "utf8"));
        const coordinate = `${definition.contractId}@${definition.version}`;
        await f.run(["push", "contract", coordinate]);
        await f.run(["yank", "contract", coordinate, "--reason", "Test account publication"]);
        await f.run(["restore", "contract", coordinate]);
        const other = await f.application.account("example--other--owner");
        await f.run(["namespace", "transfer", "ulvia", "--account", other.accountId]);
        expect((await f.application.namespaces.get("ulvia"))?.revision).toBe(2);
        await expect(f.run(["push", "contract", coordinate])).rejects.toThrow("does not own");
        f.options.environment.ULVIA_REPOSITORY_TOKEN = other.token;
        await f.run(["repository", "login", f.server.url.origin]);
        await f.run(["namespace", "list"]);
        await f.run(["namespace", "suspend", "ulvia", "--yes"]);
        expect((await f.application.namespaces.get("ulvia"))?.state).toBe("suspended");
        await expect(f.run(["push", "contract", coordinate])).rejects.toThrow("does not own");
        await f.run(["repository", "logout"]);
        expect((await readClientConfig(f.config)).repository).toBeUndefined();
        expect(f.output.join("\n")).not.toContain(f.owner.token);
        expect(f.output.join("\n")).not.toContain(other.token);
    } finally {
        await f.close();
    }
});

test("stdin login accepts a bounded PAT and missing saved credentials never invent authority", async () => {
    const f = await accountFixture();
    try {
        await runCli(["repository", "login", f.server.url.origin, "--token-stdin"], {
            ...f.options,
            environment: { ULVIA_DATA_DIR: f.data },
            stdin: new Blob([`${f.owner.token}\n`]).stream(),
        });
        expect((await readClientConfig(f.config)).repository?.token).toBe(f.owner.token);
        await f.run(["namespace", "claim", "community"]);
        await rm(join(f.config, "config.json"));
        await expect(f.run(["namespace", "claim", "another", "--repository", f.server.url.origin])).rejects.toThrow(
            "No credentials",
        );
        expect((await f.application.namespaces.get("community"))?.revision).toBe(1);
        expect(await f.application.namespaces.get("another")).toBeNull();
        await expect(f.run(["repository", "login", f.server.url.origin, "--token", f.owner.token])).rejects.toThrow(
            "Usage",
        );
        expect(f.output.join("\n")).not.toContain(f.owner.token);
    } finally {
        await f.close();
    }
});

test("a saved Repository identity cannot silently change during login or namespace writes", async () => {
    const f = await accountFixture();
    try {
        await f.run(["repository", "login", f.server.url.origin]);
        const path = join(f.config, "config.json");
        const config = await readClientConfig(f.config);
        config.repository!.repositoryId = "another-repository";
        await writeFile(path, JSON.stringify(config), { mode: 0o600 });
        await expect(f.run(["repository", "login", f.server.url.origin])).rejects.toThrow("identity changed");
        await expect(f.run(["namespace", "claim", "acme"])).rejects.toThrow("identity changed");
        expect(await f.application.namespaces.get("acme")).toBeNull();
    } finally {
        await f.close();
    }
});
