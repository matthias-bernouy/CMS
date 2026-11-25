import { expect, test } from "bun:test";
import { metadataBytes, metadataJson } from "../../../../infra/distribution/metadata";

test.each(["too-large", "deadline"])("bounded registry metadata releases the body on %s", async (mode) => {
    let cancelled = false;
    const response = new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                if (mode === "too-large") {
                    controller.enqueue(new Uint8Array(33));
                }
            },
            cancel() {
                cancelled = true;
            },
        }),
    );
    await expect(metadataBytes(response, 32, "registry", 10)).rejects.toThrow();
    expect(cancelled).toBe(true);
});

test("duplicate JSON keys and deep metadata cannot become publication evidence", async () => {
    await expect(metadataJson(new Response('{"version":"1.0.0","version":"2.0.0"}'), 4096, "npm")).rejects.toThrow();
    await expect(metadataJson(new Response("[".repeat(32) + "0" + "]".repeat(32)), 4096, "npm")).rejects.toThrow();
});
