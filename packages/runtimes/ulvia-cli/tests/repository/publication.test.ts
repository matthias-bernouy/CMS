import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { signRepositoryRequest } from "../../src/repository/remote/auth";
import { encodePublication } from "../../src/repository/remote/protocol";
import { startLocalRepository } from "../../src/runtime/repository";

test("remote publication is signed, immutable, atomic, and reversibly yankable", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-publication-source-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-publication-target-"));
    const token = "a".repeat(43);
    const server = startLocalRepository(0, remoteRoot, token);
    const source = resolve(import.meta.dir, "../../../../official-repository/contracts/catalog.items");
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
        const body = encodePublication({ kind: "contract", canonicalJson, assets: [] });
        const publicationUrl = new URL("/v1/publications", server.url);

        expect((await fetch(publicationUrl, { method: "POST", body })).status).toBe(401);
        const publication = await signedRequest(publicationUrl, "POST", body, token);
        expect(publication.status).toBe(200);
        expect(await publication.json()).toMatchObject({ kind: "contract", added: true });
        expect((await signedRequest(publicationUrl, "POST", body, token)).status).toBe(200);

        const catalogueUrl = `${server.url}/v1/contracts`;
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toHaveLength(1);
        const coordinate = `${definition.publisherId}/${definition.contractId}/${definition.version}`;
        const yankUrl = new URL(`/v1/yanks/contract/${coordinate}`, server.url);
        const yankBody = Buffer.from(JSON.stringify({ reason: "Known protocol defect" }));
        expect((await signedRequest(yankUrl, "PUT", yankBody, token)).status).toBe(200);
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toEqual([]);
        expect((await fetch(`${catalogueUrl}/${coordinate}`)).status).toBe(200);

        const restoreBody = Buffer.from(JSON.stringify({ reason: null }));
        expect((await signedRequest(yankUrl, "PUT", restoreBody, token)).status).toBe(200);
        expect(((await (await fetch(catalogueUrl)).json()) as { releases: unknown[] }).releases).toHaveLength(1);

        const changedBody = encodePublication({
            kind: "contract",
            canonicalJson: canonicalJson.replace("Catalog items", "Changed catalog items"),
            assets: [],
        });
        expect((await signedRequest(publicationUrl, "POST", changedBody, token)).status).toBe(409);
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

async function signedRequest(url: URL, method: string, body: Uint8Array, token: string): Promise<Response> {
    const signed = signRepositoryRequest(method, url, body, token);
    return fetch(url, {
        method,
        body,
        headers: {
            Authorization: signed.authorization,
            "Content-Type": "application/json",
            "X-Ulvia-Timestamp": signed.timestamp,
            "X-Ulvia-Nonce": signed.nonce,
            "X-Ulvia-Content-SHA256": signed.contentDigest,
            "X-Ulvia-Signature": signed.signature,
        },
    });
}
