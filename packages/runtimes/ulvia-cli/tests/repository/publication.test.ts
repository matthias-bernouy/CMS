import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { startTestRepository } from "./fixture";
import { prepareContractSource } from "../../src/release/authored/contract";

test("remote publication is account-authorized, immutable, atomic, and reversibly yankable", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-publication-source-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-publication-target-"));
    const server = startTestRepository(remoteRoot);
    const source = resolve(import.meta.dir, "../../../../official-repository/contracts/ulvia.cms.installations");
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
        const admission = (await prepareContractSource(source)).admission;
        const envelope = { kind: "contract" as const, canonicalJson, assets: admission.documentationAssets ?? [] };
        await expect(new RemoteRepositoryClient(server.url).push(envelope)).rejects.toThrow(
            "authenticated namespace credential",
        );
        const client = new RemoteRepositoryClient(server.url, await server.claim());
        expect(await client.push(envelope)).toMatchObject({ added: true });
        expect(await client.push(envelope)).toMatchObject({ added: false });

        const catalogueUrl = `${server.url}/.cms/call/ulvia.repository/v1/catalogue`;
        const catalogue = () =>
            fetch(catalogueUrl, {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: "contract", limit: 256 }),
            });
        expect(((await (await catalogue()).json()) as { releases: unknown[] }).releases).toHaveLength(1);
        const coordinate = `${definition.publisherId}/${definition.contractId}/${definition.version}`;
        const remoteCoordinate = {
            kind: "contract" as const,
            publisherId: definition.publisherId,
            id: definition.contractId,
            version: definition.version,
        };
        await client.yank(remoteCoordinate, "Known protocol defect");
        expect(((await (await catalogue()).json()) as { releases: unknown[] }).releases).toEqual([]);
        expect(
            (await fetch(`${server.url}/.cms/call/ulvia.repository/v1/releases/contract/${coordinate}`)).status,
        ).toBe(200);

        await client.yank(remoteCoordinate, null);
        expect(((await (await catalogue()).json()) as { releases: unknown[] }).releases).toHaveLength(1);

        const changed = {
            kind: "contract",
            canonicalJson: canonicalJson.replace("CMS Installations", "Changed CMS Installations"),
            assets: envelope.assets,
        } as const;
        await expect(client.push(changed)).rejects.toThrow("409");
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
        await server.stop();
        await Promise.all([
            rm(data, { recursive: true, force: true }),
            rm(remoteRoot, { recursive: true, force: true }),
        ]);
    }
});
