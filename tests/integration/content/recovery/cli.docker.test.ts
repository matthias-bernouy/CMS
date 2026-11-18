import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Document } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { createCmsSiteBloc } from "@bernouy/content";
import { contentMongo } from "../mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "operator CLI upgrades only the selected prefix and recovers an inspected fence",
    async () => {
        const f = await contentMongo();
        const directory = await mkdtemp(join(tmpdir(), "ulvia-content-cli-"));
        try {
            const secret = join(directory, "mongo-uri");
            await writeFile(secret, f.url, { mode: 0o600 });
            const db = f.client.db();
            const raw = new MongoContentRepository(db, { collectionPrefix: "selected_" });
            await raw.init();
            await createCmsSiteBloc(raw, {
                tag: "site-existing",
                name: "Existing",
                group: "Site",
                content: "<p>Keep</p>",
            });
            await db.collection("selected_blocs").updateMany({}, { $unset: { contentReferences: "" } });
            await db.collection("selected_content_metadata").deleteMany({});
            await db.collection<Document & { _id: string }>("other_blocs").insertOne({ _id: "untouched", keep: true });
            const invoke = async (action: string, extra: string[] = []) => {
                const child = Bun.spawn(
                    [
                        "bun",
                        "--no-macros",
                        "run",
                        "packages/runtimes/ulvia-provider-server/src/maintenance/index.ts",
                        action,
                        "--uri-file",
                        secret,
                        "--database",
                        db.databaseName,
                        "--prefix",
                        "selected_",
                        ...extra,
                    ],
                    { stdout: "pipe", stderr: "pipe" },
                );
                const [code, stdout, stderr] = await Promise.all([
                    child.exited,
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                ]);
                expect(stdout + stderr).not.toContain(f.url);
                return { code, stdout, stderr };
            };
            expect((await invoke("upgrade-references")).code).toBe(1);
            expect(await db.collection("selected_content_metadata").countDocuments()).toBe(0);
            const upgraded = await invoke("upgrade-references", ["--writers-stopped"]);
            expect(upgraded.code).toBe(0);
            expect(JSON.parse(upgraded.stdout)).toMatchObject({ updated: 1, complete: true });
            const locks = db.collection<Document & { _id: string }>("selected_site_bloc_publication_locks");
            await locks.insertOne({
                _id: "published-graph",
                token: "inspected",
                phase: "committing",
                expiresAt: new Date(0),
                committingAt: new Date(0),
            });
            const status = await invoke("status");
            expect(status.code).toBe(0);
            expect(JSON.parse(status.stdout).fence.token).toBe("inspected");
            expect(
                (
                    await invoke("recover-references", [
                        "--writers-stopped",
                        "--site-id",
                        "site",
                        "--expected-token",
                        "foreign",
                    ])
                ).code,
            ).toBe(1);
            expect((await locks.findOne({ _id: "published-graph" }))?.token).toBe("inspected");
            const recovered = await invoke("recover-references", [
                "--writers-stopped",
                "--site-id",
                "site",
                "--expected-token",
                "inspected",
            ]);
            expect(recovered.code).toBe(0);
            expect(JSON.parse(recovered.stdout)).toMatchObject({ recovered: true });
            expect(await db.collection("other_blocs").findOne({ _id: "untouched" } as never)).toEqual({
                _id: "untouched",
                keep: true,
            });
            await new MongoContentRepository(db, { collectionPrefix: "selected_" }).init();
        } finally {
            await rm(directory, { recursive: true, force: true });
            await f.close();
        }
    },
    60_000,
);
