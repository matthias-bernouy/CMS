import { expect, test } from "bun:test";
import { readCaptureFile } from "../../../src/runtime/content/captures/files";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
test("capture file resources use only current-instance anonymous Files queries", async () => {
    const calls: GatewayInvocation[] = [];
    const invoker = {
        invoke: async (call: GatewayInvocation) => {
            calls.push(call);
            return {
                kind: "binary" as const,
                requestId: "test",
                contentType: "image/png",
                stream: new Response("bytes").body!,
            };
        },
    };
    const result = await readCaptureFile(
        invoker,
        "instance-a",
        "/.cms/call/ulvia/cms.files/files/file/generation/representations/thumbnail/320.webp?access=signed",
    );
    expect(await result.text()).toBe("bytes");
    expect(calls).toMatchObject([
        {
            siteId: "instance-a",
            actor: { kind: "anonymous" },
            contractId: "ulvia/cms.files",
            capabilityId: "representations.read",
            input: { fileId: "file", generation: "generation", profile: "thumbnail", width: 320, access: "signed" },
        },
    ]);
    for (const path of [
        "/.cms/oauth/token",
        "/.cms/call/ulvia/cms.files/files/id/gen?namespaceKey=secret",
        "/.cms/call/ulvia/cms.files/files/id/gen?access=a&access=b",
        "/other",
    ]) {
        expect((await readCaptureFile(invoker, "instance-a", path)).status).toBe(404);
    }
    expect(calls).toHaveLength(1);
});
test("an authorization refusal produces no file bytes and never retries with administrator authority", async () => {
    let calls = 0;
    const result = await readCaptureFile(
        {
            invoke: async () => {
                calls++;
                return { kind: "declared-error", requestId: "test", errorCode: "NOT_AUTHORIZED", retryable: false };
            },
        },
        "instance-a",
        "/.cms/call/ulvia/cms.files/files/id/gen",
    );
    expect(result.status).toBe(404);
    expect(await result.text()).toBe("");
    expect(calls).toBe(1);
});
