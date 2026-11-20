import { expect, test } from "bun:test";
import { inlineImage } from "cms-gateway/invocation/mcp/images";
import type { GatewayResult } from "cms-gateway/invocation/interfaces/Invocation";
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNXcAAAAASUVORK5CYII=",
    "base64",
);
test("inline PNG results carry pixels and matching structured metadata", async () => {
    const response = new Response(png);
    const result = await inlineImage(
        { kind: "binary", requestId: "image", stream: response.body!, contentType: "image/png" } as Extract<
            GatewayResult,
            { kind: "binary" }
        >,
        4194304,
    );
    expect(result.structuredContent).toEqual({ output: { mimeType: "image/png" } });
    expect(result.content).toContainEqual({ type: "image", mimeType: "image/png", data: png.toString("base64") });
});
test("invalid signatures and excessive inline results refuse and release their stream", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(64));
        },
        cancel() {
            cancelled = true;
        },
    });
    await expect(
        inlineImage(
            { kind: "binary", requestId: "image", stream, contentType: "image/png" } as Extract<
                GatewayResult,
                { kind: "binary" }
            >,
            100,
        ),
    ).rejects.toThrow();
    expect(cancelled).toBeTrue();
    expect(stream.locked).toBeFalse();
    await expect(
        inlineImage(
            {
                kind: "binary",
                requestId: "image",
                stream: new Response("not PNG").body!,
                contentType: "image/png",
            } as Extract<GatewayResult, { kind: "binary" }>,
            100,
        ),
    ).rejects.toThrow();
});
