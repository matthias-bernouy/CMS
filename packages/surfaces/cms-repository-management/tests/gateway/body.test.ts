import { describe, expect, test } from "bun:test";
import { readGatewayBody } from "cms-repository-management/gateway/body";

describe("repository management gateway body reader", () => {
    test("cancels a stalled upload at the configured deadline", async () => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            cancel() {
                cancelled = true;
            },
        });
        const request = new Request("http://repository.invalid/candidate", {
            method: "POST",
            body,
        });

        await expect(readGatewayBody(request, 64 * 1_024, 10)).rejects.toMatchObject({ status: 408 });
        expect(cancelled).toBeTrue();
    });
});
