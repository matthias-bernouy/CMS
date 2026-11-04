import { expect, test } from "bun:test";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";
import { spawnModelProcess } from "../src/default-implementation/transformers/process";
import type { EmbeddingWorkerReply } from "../src/interfaces/EmbeddingWorker";

const cacheDirectory = process.env.ULVIA_EMBEDDING_TEST_MODEL_DIR;
const native = cacheDirectory ? test : test.skip;
const options = { cacheDirectory: cacheDirectory!, localFilesOnly: true, threads: 2 };
const text = "Reusable page components share semantic theme tokens and editable content. ".repeat(15);

native(
    "native model processes drain bounded inference and exit cleanly across repeated lifecycles",
    async () => {
        for (let cycle = 0; cycle < 3; cycle++) {
            const model = new TransformersEmbeddings(options);
            try {
                await model.initialize(new AbortController().signal);
                const jobs = [0, 1, 2, 3].map(() => model.embed([text, text], "passage", new AbortController().signal));
                const refused = model.embed([text], "query", new AbortController().signal);
                await expect(refused).rejects.toThrow("concurrency budget");
                const closing = model.close();
                for (const vectors of await Promise.all(jobs)) {
                    expect(vectors).toHaveLength(2);
                    for (const vector of vectors) {
                        expect(vector).toHaveLength(384);
                        expect(vector.every(Number.isFinite)).toBe(true);
                        expect(Math.abs(Math.hypot(...vector) - 1)).toBeLessThan(1e-5);
                    }
                }
                await closing;
                await model.close();
                await expect(model.embed([text], "query", new AbortController().signal)).rejects.toThrow();
            } finally {
                await model.close();
            }
        }
    },
    60_000,
);

native(
    "the native model disposes and exits when its parent disconnects with queued work",
    async () => {
        let receive!: (reply: EmbeddingWorkerReply) => void;
        const initialized = new Promise<EmbeddingWorkerReply>((resolve) => {
            receive = resolve;
        });
        const child = spawnModelProcess(receive);
        try {
            child.send({ id: 1, action: "initialize", options });
            expect((await initialized).error).toBeUndefined();
            for (let index = 0; index < 4; index++) {
                child.send({ id: index + 2, action: "embed", texts: [text, text], kind: "passage" });
            }
            child.disconnect();
            expect(await child.exited).toBe(0);
        } finally {
            child.kill();
            await child.exited;
        }
    },
    60_000,
);
