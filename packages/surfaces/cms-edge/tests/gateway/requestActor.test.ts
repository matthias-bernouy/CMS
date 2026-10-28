import { describe, expect, test } from "bun:test";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type EdgeCms from "cms-edge/EdgeCms";
import { resolveRequestActor } from "cms-edge/http/auth/resolveRequestActor";

describe("request actor resolution", () => {
    test("single-flights one resolver per Edge and Request only", async () => {
        let calls = 0;
        const edge = actorEdge(async () => {
            calls += 1;
            await Promise.resolve();
            return { kind: "user", subjectId: "subject-a" };
        });
        const request = new Request("https://edge.test/admin");

        const [first, second] = await Promise.all([
            resolveRequestActor(edge, request),
            resolveRequestActor(edge, request),
        ]);

        expect(calls).toBe(1);
        expect(first).toEqual({ kind: "user", subjectId: "subject-a" });
        expect(second).toEqual(first);
        await resolveRequestActor(edge, new Request(request.url));
        expect(calls).toBe(2);

        const otherEdge = actorEdge(async () => ({ kind: "anonymous" }));
        expect(await resolveRequestActor(otherEdge, request)).toEqual({ kind: "anonymous" });
    });

    test("does not cache a failed authority lookup as an anonymous actor", async () => {
        let calls = 0;
        const edge = actorEdge(async () => {
            calls += 1;
            if (calls === 1) {
                throw new Error("Access unavailable");
            }
            return { kind: "administrator", subjectId: "subject-a" };
        });
        const request = new Request("https://edge.test/admin");

        await expect(resolveRequestActor(edge, request)).rejects.toThrow("Access unavailable");
        expect(await resolveRequestActor(edge, request)).toEqual({
            kind: "administrator",
            subjectId: "subject-a",
        });
    });
});

function actorEdge(resolveActor: (request: Request) => Promise<GatewayActor>): EdgeCms {
    return { resolveActor } as EdgeCms;
}
