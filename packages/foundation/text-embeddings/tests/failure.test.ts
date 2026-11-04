import { expect, spyOn, test } from "bun:test";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";

test("unexpected model process death rejects pending work and remains a failed shutdown", async () => {
    const original = Bun.spawn;
    const spawn = spyOn(Bun, "spawn").mockImplementation((...args) => {
        const child = Reflect.apply(original, Bun, args);
        child.kill("SIGKILL");
        return child;
    });
    const model = new TransformersEmbeddings({ cacheDirectory: "/unused", localFilesOnly: true });
    try {
        await expect(model.initialize(new AbortController().signal)).rejects.toThrow();
        await expect(model.close()).rejects.toThrow("did not exit cleanly");
    } finally {
        spawn.mockRestore();
        await model.close().catch(() => undefined);
    }
});
