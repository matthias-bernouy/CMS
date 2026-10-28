import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { delegationFixture } from "./fixtures";
import { NOW } from "../../fixtures";

test("binary source tickets close on completion, cancellation and errors rather than on headers", async () => {
    for (const outcome of ["complete", "cancel", "error", "metadata"] as const) {
        const f = await delegationFixture({ sourceBinary: true });
        let ticket: string | undefined;
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const gateway = new CapabilityGateway({
            routes: f.routes,
            delegations: f.authority,
            now: () => NOW,
            authorize: async () => true,
            transport: {
                send: async (request) => {
                    ticket = request.delegation?.ticket;
                    return {
                        contentType: "application/octet-stream",
                        stream: new ReadableStream<Uint8Array>({
                            start(value) {
                                controller = value;
                            },
                        }),
                    };
                },
            },
        });
        const result = await gateway.invoke({
            siteId: "site-a",
            contractId: "origin",
            capabilityId: "item.list",
            input: { fileId: "file-1" },
            actor: { kind: "anonymous" },
            ...(outcome === "metadata" ? { metadataOnly: true } : {}),
        });
        expect(result.kind).toBe("binary");
        expect(ticket).toBeDefined();
        if (result.kind !== "binary") {
            throw new Error("Expected a binary result");
        }
        if (outcome === "metadata") {
            await expect(f.authority.check(f.child(ticket!))).rejects.toMatchObject({ code: "not_authorized" });
            await result.stream.cancel();
            continue;
        }
        await expect(f.authority.check(f.child(ticket!))).resolves.toBeDefined();
        const reader = result.stream.getReader();
        if (outcome === "complete") {
            controller!.enqueue(new Uint8Array([1, 2]));
            controller!.close();
            expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
            expect((await reader.read()).done).toBe(true);
        } else if (outcome === "cancel") {
            await reader.cancel();
        } else {
            controller!.error(new Error("source stream failed"));
            await expect(reader.read()).rejects.toThrow("source stream failed");
        }
        await expect(f.authority.check(f.child(ticket!))).rejects.toMatchObject({ code: "not_authorized" });
    }
});
