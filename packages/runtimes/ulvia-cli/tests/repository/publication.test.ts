import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { startLocalRepository } from "../../src/runtime/repository";

test("remote publication is signed, immutable, atomic, and reversibly yankable", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-publication-source-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-publication-target-"));
    const token = "a".repeat(43);
    const server = startLocalRepository(0, remoteRoot, token);
    const source = resolve(import.meta.dir, "../../../../official-repository/contracts/ulvia.cms.jobs");
    try {
        await runCli(["release", source], { environment: { ULVIA_DATA_DIR: data }, log: () => undefined });
        const definition = JSON.parse(await readFile(join(source, "definition.json"), "utf8")) as {
            publisherId: string;
            contractId: string;
            version: string;
        };
        const path = join(
            data,
            "repository",
            "contracts",
            definition.publisherId,
            definition.contractId,
            `${definition.version}.json`,
        );
        const canonicalJson = await readFile(path, "utf8");
        const envelope = { kind: "contract" as const, canonicalJson, assets: [] };
        await expect(new RemoteRepositoryClient(server.url).push(envelope)).rejects.toThrow("ULVIA_REPOSITORY_TOKEN");
        const client = new RemoteRepositoryClient(server.url, token);
        expect(await client.push(envelope)).toMatchObject({ added: true });
        expect(await client.push(envelope)).toMatchObject({ added: false });

        const catalogueUrl = `${server.url}/v1/contracts`;
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toHaveLength(1);
        const coordinate = `${definition.publisherId}/${definition.contractId}/${definition.version}`;
        const remoteCoordinate = {
            kind: "contract" as const,
            publisherId: definition.publisherId,
            id: definition.contractId,
            version: definition.version,
        };
        await client.yank(remoteCoordinate, "Known protocol defect");
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toEqual([]);
        expect((await fetch(`${catalogueUrl}/${coordinate}`)).status).toBe(200);

        await client.yank(remoteCoordinate, null);
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toHaveLength(1);

        const changed = {
            kind: "contract",
            canonicalJson: canonicalJson.replace("CMS Jobs", "Changed CMS Jobs"),
            assets: [],
        } as const;
        await expect(client.push(changed)).rejects.toThrow("already published");
        expect(
            await Bun.file(
                join(
                    remoteRoot,
                    "contracts",
                    definition.publisherId,
                    definition.contractId,
                    `${definition.version}.json`,
                ),
            ).text(),
        ).toBe(canonicalJson);
    } finally {
        server.stop();
        await Promise.all([
            rm(data, { recursive: true, force: true }),
            rm(remoteRoot, { recursive: true, force: true }),
        ]);
    }
});
