import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryApplication } from "../../../../../tests/fixtures/repository/application";
import { parsePublicationUpload } from "@bernouy/cms-repository/repository/publication";
import { RecordingRegistry } from "./publicationFixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("removed evidence publication routes do not read bodies or invoke publication", async () => {
    const registry = new RecordingRegistry();
    const root = await mkdtemp(join(tmpdir(), "repository-retired-route-"));
    roots.push(root);
    const app = repositoryApplication(root, "retired-route", registry);
    const request = new Request("https://repository.example/.cms/call/ulvia/repository/v1/conformance-evidence", {
        method: "POST",
        body: JSON.stringify({ kind: "conformance-evidence" }),
    });
    expect((await app.handle(request)).status).toBe(404);
    await app.close();
    expect(request.bodyUsed).toBe(false);
    expect(registry.publications).toEqual([]);
});

test("removed evidence downloads remain unavailable even when old files exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-unsupported-routes-"));
    roots.push(root);
    const id = "00000000-0000-4000-8000-000000000001";
    const directory = join(root, "conformance-evidence", "example.provider", "example.publisher/example.contract");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ private: "old evidence" }));
    const app = repositoryApplication(root);
    for (const method of ["GET", "HEAD"]) {
        const response = await app.handle(
            new Request(
                `https://repository.example/.cms/call/ulvia/repository/v1/conformance-evidence/example.provider/example.contract/${id}`,
                {
                    method,
                },
            ),
        );
        expect(response?.status).toBe(404);
        expect(await response!.text()).toBe("");
    }
    await app.close();
});

test("publication metadata accepts only collection, contract and provider artifacts", () => {
    expect(() =>
        parsePublicationUpload(
            Buffer.from(JSON.stringify({ kind: "conformance-evidence", canonicalJson: "{}", assets: [] })),
        ),
    ).toThrow();
});
