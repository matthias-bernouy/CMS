import { expect, test } from "bun:test";
import { ValidatingContentRepository, createCmsSiteBloc, publishCmsSiteBloc } from "@bernouy/content";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { contentMongo } from "./mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

async function startWorker(url: string, operation: string, identity: string) {
    const child = Bun.spawn(
        [process.execPath, "run", "--no-macros", import.meta.dir + "/worker.ts", url, operation, identity],
        { stdout: "pipe", stderr: "pipe" },
    );
    const reader = child.stdout.getReader();
    let output = "";
    const read = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Worker protocol timed out")), 15_000);
        });
        const chunk = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
        if (!chunk.done) {
            output += new TextDecoder().decode(chunk.value);
        }
        return chunk.done;
    };
    return {
        async waitForFence() {
            while (!output.includes("waiting\n")) {
                if (await read()) {
                    throw new Error(`Worker did not wait for the reference fence: ${output}`);
                }
            }
        },
        async result() {
            while (!(await read())) {
                /* Consume the complete protocol stream. */
            }
            const code = await child.exited;
            expect(code, await new Response(child.stderr).text()).toBe(0);
            return JSON.parse(output.trim().split("\n").at(-1)!);
        },
        async close() {
            child.kill();
            await child.exited;
            await reader.cancel().catch(() => {});
        },
    };
}

integration(
    "real standalone Mongo serializes two processes and keeps deletion reference checks bounded",
    async () => {
        const fixture = await contentMongo();
        let worker: Awaited<ReturnType<typeof startWorker>> | undefined;
        try {
            const raw = new MongoContentRepository(fixture.client.db());
            await raw.init();
            const repository = new ValidatingContentRepository(raw);
            const create = async () => {
                await createCmsSiteBloc(repository, {
                    tag: "site-target",
                    name: "Target",
                    group: "Site",
                    content: "<p>Target</p>",
                });
                await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
            };
            await create();
            let identity = (await repository.getBlocRecord("site-target"))!.siteDefinition!.id;
            let enter!: () => void;
            let release!: () => void;
            const entered = new Promise<void>((resolve) => {
                enter = resolve;
            });
            const resume = new Promise<void>((resolve) => {
                release = resolve;
            });
            const insert = raw.insertPage.bind(raw);
            raw.insertPage = async (...args) => {
                enter();
                await resume;
                return insert(...args);
            };
            const writer = repository.insertPage("/consumer", "Consumer", '<div cms-bloc="site-target"></div>');
            try {
                await entered;
                worker = await startWorker(fixture.url, "delete", identity);
                await worker.waitForFence();
            } finally {
                release();
            }
            await writer;
            expect(await worker!.result()).toEqual({ ok: false, name: "SiteBlocReferencedError" });
            await worker!.close();
            worker = undefined;
            const page = (await repository.getPage("/consumer"))!;
            await repository.deletePage(page.id, page.revision);
            raw.insertPage = insert;
            await fixture.client.db("admin").command({
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["delete"],
                    appName: "content-lifecycle-parent",
                    blockConnection: true,
                    blockTimeMS: 3000,
                },
            });
            let deleting!: () => void;
            const started = new Promise<void>((resolve) => {
                deleting = resolve;
            });
            const onDelete = (event: { commandName: string; command: { delete?: string } }) => {
                if (event.commandName === "delete" && event.command.delete === "blocs") {
                    deleting();
                }
            };
            fixture.client.on("commandStarted", onDelete);
            const deletion = repository.deleteSiteBloc("site-target", 1, identity);
            await started;
            worker = await startWorker(fixture.url, "insert", identity);
            await worker.waitForFence();
            await deletion;
            expect((await worker.result()).ok).toBe(false);
            await worker.close();
            worker = undefined;
            fixture.client.off("commandStarted", onDelete);
            expect(await repository.getPage("/consumer")).toBeNull();
            expect(await repository.getBlocRecord("site-target")).toBeNull();
            await create();
            identity = (await repository.getBlocRecord("site-target"))!.siteDefinition!.id;
            const commands: { name: string; command: Record<string, unknown> }[] = [];
            fixture.client.on("commandStarted", (event) =>
                commands.push({ name: event.commandName, command: event.command }),
            );
            await repository.deleteSiteBloc("site-target", 1, identity);
            expect(commands.map(({ name }) => name)).toEqual([
                "find",
                "insert",
                "find",
                "find",
                "find",
                "update",
                "delete",
                "delete",
            ]);
            const searches = commands.filter(
                ({ name, command }) =>
                    name === "find" && ["pages", "blocs"].includes(String(command.find)) && command.projection,
            );
            expect(searches).toHaveLength(2);
            for (const { command } of searches) {
                expect(command.projection).toEqual({ _id: 1 });
                expect(command.limit).toBe(17);
                expect(command.maxTimeMS).toBe(1000);
            }
        } finally {
            await worker?.close();
            await fixture.close();
        }
    },
    60_000,
);
