import { describe, expect, test } from "bun:test";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type KernelCms from "cms-kernel/KernelCms";
import { resolveRequestActor } from "cms-kernel/http/pages/access/resolveRequestActor";

describe("request actor resolution", () => {
    test("single-flights one resolver per Kernel and Request only", async () => {
        let calls = 0;
        const kernel = actorKernel(async () => {
            calls += 1;
            await Promise.resolve();
            return { kind: "user", subjectId: "subject-a" };
        });
        const request = new Request("https://kernel.test/admin");

        const [first, second] = await Promise.all([
            resolveRequestActor(kernel, request),
            resolveRequestActor(kernel, request),
        ]);

        expect(calls).toBe(1);
        expect(first).toEqual({ kind: "user", subjectId: "subject-a" });
        expect(second).toEqual(first);
        await resolveRequestActor(kernel, new Request(request.url));
        expect(calls).toBe(2);

        const otherKernel = actorKernel(async () => ({ kind: "anonymous" }));
        expect(await resolveRequestActor(otherKernel, request)).toEqual({ kind: "anonymous" });
    });

    test("does not cache a failed authority lookup as an anonymous actor", async () => {
        let calls = 0;
        const kernel = actorKernel(async () => {
            calls += 1;
            if (calls === 1) {
                throw new Error("Access unavailable");
            }
            return { kind: "administrator", subjectId: "subject-a" };
        });
        const request = new Request("https://kernel.test/admin");

        await expect(resolveRequestActor(kernel, request)).rejects.toThrow("Access unavailable");
        expect(await resolveRequestActor(kernel, request)).toEqual({
            kind: "administrator",
            subjectId: "subject-a",
        });
    });
});

function actorKernel(resolveActor: (request: Request) => Promise<GatewayActor>): KernelCms {
    return { resolveActor } as KernelCms;
}
