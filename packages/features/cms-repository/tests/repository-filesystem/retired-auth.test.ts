import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as namespaces from "@bernouy/cms-repository/repository/namespaces";
import { repositoryApplication } from "../../../../../tests/fixtures/repository/application";

test("retired signing exports and endpoints cannot grant namespace ownership", async () => {
    for (const name of [
        "RepositoryNamespaceAuthority",
        "RepositoryNamespaceEndpoint",
        "signNamespaceProof",
        "repositoryWriteHeaders",
    ]) {
        expect(Object.hasOwn(namespaces, name)).toBe(false);
    }
    const root = await mkdtemp(join(tmpdir(), "retired-repository-auth-"));
    const app = repositoryApplication(root);
    try {
        for (const path of [
            "/v1/namespaces/claim",
            "/v1/publication-uploads",
            "/.cms/call/ulvia/repository/v1/namespace-actions/rotate",
        ]) {
            const request = new Request(`https://repository.example${path}`, {
                method: "POST",
                body: "retired signing request",
            });
            expect((await app.handle(request)).status).toBe(404);
            expect(request.bodyUsed).toBe(false);
        }
        const claim = new Request("https://repository.example/.cms/call/ulvia/repository/v1/namespace-actions/claim", {
            method: "POST",
            headers: { "content-type": "application/json", "x-repository-proof": "retired-proof" },
            body: JSON.stringify({ namespace: "community" }),
        });
        expect((await app.handle(claim)).status).toBe(401);
        expect(await app.namespaces.get("community")).toBeNull();
        const owner = await app.account();
        const forged = new Request(claim.url, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${owner.token}` },
            body: JSON.stringify({ namespace: "community", ownerAccountId: "arbitrary-account" }),
        });
        expect((await app.handle(forged)).status).toBe(400);
        expect(await app.namespaces.get("community")).toBeNull();
    } finally {
        await app.close();
        await rm(root, { recursive: true, force: true });
    }
});
