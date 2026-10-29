import { expect, test } from "bun:test";
import { preparedFixture } from "./fixture";
const invocation = {
    siteId: "default",
    contractId: "catalog",
    capabilityId: "item.list",
    input: { term: "test" },
    actor: { kind: "anonymous" as const },
};
const credential = "opaque-provider-credential-" + "a".repeat(32);

test("unknown and excessive upload lengths are rejected as client input before machine preparation or dispatch", async () => {
    const f = await preparedFixture(false, undefined, true);
    try {
        for (const contentLength of [undefined, -1, 64 * 1024 * 1024 + 1, NaN]) {
            const stream = new ReadableStream<Uint8Array>();
            await expect(
                f.gateway.invokeProvider!(credential, {
                    ...invocation,
                    binaryBody: { stream, contentType: "application/octet-stream", contentLength },
                }),
            ).rejects.toMatchObject({ code: "invalid_input" });
            await stream.cancel();
        }
        expect(f.events).toEqual([]);
        expect(f.preparations).toEqual([]);
    } finally {
        f.close();
    }
});

test("broker input refusals and stale routes retain their client classifications; transport outages remain failures", async () => {
    const f = await preparedFixture(false, undefined, true);
    try {
        for (const [status, code] of [
            [400, "invalid_input"],
            [411, "invalid_input"],
            [413, "invalid_input"],
            [422, "invalid_input"],
            [409, "not_selected"],
            [403, "not_authorized"],
            [503, "transport_failure"],
        ] as const) {
            f.reject(status);
            await expect(f.gateway.invokeProvider!(credential, invocation)).rejects.toMatchObject({ code });
        }
        expect(f.events).not.toContain("business");
    } finally {
        f.close();
    }
});
