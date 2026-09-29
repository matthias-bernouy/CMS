import { expect, test } from "bun:test";
import { ProviderImageService } from "@bernouy/cms-gateway/media";
import type { GatewayInvocation } from "@bernouy/cms-gateway";

test("queued image requests use their input as submitted", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
        release = resolve;
    });
    const seen: string[] = [];
    const service = new ProviderImageService({
        invoker: {
            invoke: async (invocation) => {
                seen.push((invocation.input as { fileId: string }).fileId);
                if (seen.length === 1) {
                    await hold;
                }
                return { kind: "declared-error", status: 404, requestId: "request-1", errorCode: "missing" };
            },
        },
        transformer: {
            encoderIdentity: "test",
            inspect: async () => {
                throw new Error("not reached");
            },
            transform: async () => {
                throw new Error("not reached");
            },
        },
        store: { get: async () => null, put: async () => undefined },
        maxConcurrent: 1,
    });
    const makeInvocation = (fileId: string): GatewayInvocation => ({
        siteId: "site-a",
        contractId: "files",
        capabilityId: "file.read",
        input: { fileId },
        origin: "delivery",
        actor: { kind: "anonymous" },
    });
    const first = service.get(makeInvocation("first"), 256);
    const queued = makeInvocation("original");
    const second = service.get(queued, 256);
    (queued.input as { fileId: string }).fileId = "changed";
    release();
    await Promise.all([first, second]);
    expect(seen).toEqual(["first", "original"]);
});
