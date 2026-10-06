import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfficialRepositoryApplication } from "../src/application";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("mounts public health and catalogue reads while protecting mutations", async () => {
    const root = await temporaryRoot();
    const application = await createOfficialRepositoryApplication(root, "a".repeat(32));

    const health = await application.handle(new Request("http://repository.test/healthz"));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    expect(health.headers.get("cache-control")).toBe("no-store");

    const readiness = await application.handle(new Request("http://repository.test/readyz"));
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({ status: "ready" });

    const catalogue = await application.handle(new Request("http://repository.test/v1/collections"));
    expect(catalogue.status).toBe(200);
    expect(await catalogue.json()).toEqual({ releases: [] });
    expect(catalogue.headers.get("access-control-allow-origin")).toBe("*");
    expect(catalogue.headers.get("x-content-type-options")).toBe("nosniff");

    const mutation = await application.handle(
        new Request("http://repository.test/v1/publication-uploads", { method: "POST", body: "{}" }),
    );
    expect(mutation.status).toBe(401);
    expect(mutation.headers.get("access-control-allow-origin")).toBeNull();
    expect(mutation.headers.get("cache-control")).toBe("no-store");
});

test("keeps liveness up while readiness reports unavailable storage", async () => {
    const root = await temporaryRoot();
    const application = await createOfficialRepositoryApplication(root, "c".repeat(32));
    await rm(root, { recursive: true });

    expect((await application.handle(new Request("http://repository.test/healthz"))).status).toBe(200);
    const readiness = await application.handle(new Request("http://repository.test/readyz"));
    expect(readiness.status).toBe(503);
    expect(await readiness.json()).toEqual({ status: "unavailable" });
});

test("fails startup when persisted repository artifacts are corrupt", async () => {
    const root = await temporaryRoot();
    const directory = join(root, "contracts", "ulvia.official", "broken");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "1.0.0.json"), "not json");

    await expect(createOfficialRepositoryApplication(root, "b".repeat(32))).rejects.toThrow();
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "official-repository-server-"));
    roots.push(root);
    return root;
}
