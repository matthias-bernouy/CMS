import { expect, test } from "bun:test";
import { spawnModelProcess } from "../src/default-implementation/transformers/process";
import type { EmbeddingWorkerReply } from "../src/interfaces/EmbeddingWorker";

test.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
    "the native model starts with telemetry disabled in libc and cannot inherit parent credentials",
    async () => {
        const previous = process.env.ULVIA_TEST_PARENT_SECRET;
        process.env.ULVIA_TEST_PARENT_SECRET = "must-never-reach-the-native-model";
        let receive!: (reply: EmbeddingWorkerReply) => void;
        const reply = new Promise<EmbeddingWorkerReply>((resolve) => {
            receive = resolve;
        });
        const child = spawnModelProcess(receive, new URL("./fixtures/environment.ts", import.meta.url));
        try {
            child.send({ id: 1 });
            expect((await reply).vectors).toEqual([[1, 0]]);
            expect(await child.exited).toBe(0);
        } finally {
            child.kill();
            await child.exited;
            if (previous === undefined) {
                delete process.env.ULVIA_TEST_PARENT_SECRET;
            } else {
                process.env.ULVIA_TEST_PARENT_SECRET = previous;
            }
        }
    },
);
