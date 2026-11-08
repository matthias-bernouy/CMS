import { expect, test } from "bun:test";
import { repositoryServices } from "./services";
import { repositoryTransport } from "./transport";
const coordinate = { kind: "contract", publisherId: "community", id: "community/sample", version: "1.0.0" };
const digest = `sha256:${"1".repeat(64)}`;

test("Repository downloads preserve immutable headers and do not buffer the native source", async () => {
    let pulls = 0;
    let cancellations = 0;
    const call = await repositoryTransport(
        repositoryServices({
            reads: {
                asset: async () => ({
                    stream: new ReadableStream<Uint8Array>(
                        {
                            pull(controller) {
                                pulls++;
                                controller.enqueue(new Uint8Array([1, 2, 3]));
                            },
                            cancel() {
                                cancellations++;
                            },
                        },
                        { highWaterMark: 0 },
                    ),
                    contentType: "image/png",
                    contentLength: 3,
                    digest,
                }),
            },
        }),
    );
    const response = await call("asset-download", { ...coordinate, assetId: "docs/overview.md" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(pulls).toBe(0);
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
    await reader.cancel();
    reader.releaseLock();
    expect(pulls).toBe(1);
    expect(cancellations).toBe(1);
});

test("Repository release download refuses an oversized representation before consuming its stream", async () => {
    let pulls = 0;
    let cancellations = 0;
    const call = await repositoryTransport(
        repositoryServices({
            reads: {
                release: async () => ({
                    stream: new ReadableStream<Uint8Array>(
                        {
                            pull() {
                                pulls++;
                            },
                            cancel() {
                                cancellations++;
                            },
                        },
                        { highWaterMark: 0 },
                    ),
                    contentType: "application/json",
                    contentLength: 8 * 1024 * 1024 + 1,
                    digest,
                }),
            },
        }),
    );
    const response = await call("release-download", coordinate);
    expect(response.status).toBe(503);
    expect(pulls).toBe(0);
    expect(cancellations).toBe(1);
});
