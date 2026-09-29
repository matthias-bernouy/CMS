import { expect, test } from "bun:test";
import type { GatewayInvocation, GatewayResult } from "@bernouy/cms-gateway";
import {
    providerByteGeneration,
    ProviderImageService,
    type ProviderImageDerivativeStore,
} from "@bernouy/cms-gateway/media";

const invocation: GatewayInvocation = {
    siteId: "site-a",
    contractId: "files",
    capabilityId: "file.read",
    input: { fileId: "photo-1" },
    origin: "delivery",
    actor: { kind: "user", subjectId: "user-1" },
};

test("image derivatives reauthorize before reuse and change when provider bytes change", async () => {
    const stored = new Map<string, { bytes: Uint8Array; etag: string; width: number; height: number }>();
    const store: ProviderImageDerivativeStore = {
        get: async (key) => stored.get(key) ?? null,
        put: async (key, derivative) => {
            stored.set(key, derivative);
        },
    };
    let source = new Uint8Array([1, 2, 3]);
    let invocations = 0;
    let transforms = 0;
    const service = new ProviderImageService({
        invoker: {
            invoke: async () => {
                invocations += 1;
                return binary(source);
            },
        },
        transformer: {
            encoderIdentity: "test-encoder",
            inspect: async () => ({ format: "png", width: 600, height: 400, pages: 1 }),
            transform: async (bytes, options) => {
                transforms += 1;
                return { bytes: new Uint8Array([bytes[0]!, options.width]), width: options.width, height: 40 };
            },
        },
        store,
    });
    const first = await service.get(invocation, 256);
    const reused = await service.get(invocation, 256);
    expect(first).toEqual(reused);
    expect(invocations).toBe(2);
    expect(transforms).toBe(1);

    source = new Uint8Array([4, 5, 6]);
    const changed = await service.get(invocation, 256);
    expect(changed).not.toEqual(first);
    expect(transforms).toBe(2);
    expect(stored.size).toBe(2);
    await expect(service.get(invocation, 257)).rejects.toMatchObject({ code: "invalid_input" });
    expect(invocations).toBe(3);
});

test("image processing rejects unapproved files and animated inputs", async () => {
    let result: GatewayResult = { kind: "success", requestId: "request-1", status: 200, output: {} };
    const store: ProviderImageDerivativeStore = { get: async () => null, put: async () => undefined };
    const service = new ProviderImageService({
        invoker: { invoke: async () => result },
        transformer: {
            encoderIdentity: "test-encoder",
            inspect: async () => ({ format: "gif", width: 600, height: 400, pages: 2 }),
            transform: async () => {
                throw new Error("must not transform animation");
            },
        },
        store,
    });
    await expect(service.get(invocation, 256)).rejects.toMatchObject({ code: "invalid_provider_response" });
    result = await binary(new Uint8Array([1, 2]));
    await expect(service.get(invocation, 256)).rejects.toMatchObject({ code: "media_unavailable" });
    const valid = await binary(new Uint8Array([1, 2]));
    if (valid.kind !== "binary" || !valid.media) {
        throw new Error("test fixture must produce a media file");
    }
    result = { ...valid, media: { ...valid.media, generation: "wrong" } };
    await expect(service.get(invocation, 256)).rejects.toMatchObject({ code: "invalid_provider_response" });
});

test("distinct provider images wait behind the bounded transform capacity", async () => {
    let active = 0;
    let peak = 0;
    const service = new ProviderImageService({
        invoker: {
            invoke: async ({ input }) => binary(new Uint8Array([1, 2, 3]), (input as { fileId: string }).fileId),
        },
        transformer: {
            encoderIdentity: "test-encoder",
            inspect: async () => ({ format: "png", width: 600, height: 400, pages: 1 }),
            transform: async (_bytes, options) => {
                active++;
                peak = Math.max(peak, active);
                await Bun.sleep(10);
                active--;
                return { bytes: new Uint8Array([options.width]), width: options.width, height: 40 };
            },
        },
        store: { get: async () => null, put: async () => undefined },
        maxConcurrent: 1,
        maxPending: 3,
    });
    const results = await Promise.all(
        ["photo-1", "photo-2", "photo-3"].map((fileId) => service.get({ ...invocation, input: { fileId } }, 256)),
    );
    expect(results.every((result) => "bytes" in result)).toBe(true);
    expect(peak).toBe(1);
});

test("image capacity is reserved before contacting the provider", async () => {
    let release!: (result: GatewayResult) => void;
    const provider = new Promise<GatewayResult>((resolve) => {
        release = resolve;
    });
    let calls = 0;
    const service = new ProviderImageService({
        invoker: {
            invoke: () => {
                calls += 1;
                return provider;
            },
        },
        transformer: {
            encoderIdentity: "test-encoder",
            inspect: async () => ({ format: "png", width: 600, height: 400, pages: 1 }),
            transform: async () => ({ bytes: new Uint8Array([1]), width: 256, height: 170 }),
        },
        store: { get: async () => null, put: async () => undefined },
        maxConcurrent: 1,
        maxPending: 0,
    });
    const first = service.get(invocation, 256);
    await expect(service.get(invocation, 256)).rejects.toMatchObject({ code: "media_busy" });
    expect(calls).toBe(1);
    release(await binary(new Uint8Array([1, 2, 3])));
    await expect(first).resolves.toHaveProperty("width", 256);
});

async function binary(bytes: Uint8Array, fileId = "photo-1"): Promise<GatewayResult> {
    return {
        kind: "binary",
        requestId: "request-1",
        status: 200,
        contentType: "image/png",
        bytes,
        media: {
            siteId: "site-a",
            installationId: "install-a",
            contractId: "files",
            releaseDigest: `sha256:${"a".repeat(64)}`,
            capabilityId: "file.read",
            fileId,
            generation: await providerByteGeneration(bytes),
        },
    };
}
