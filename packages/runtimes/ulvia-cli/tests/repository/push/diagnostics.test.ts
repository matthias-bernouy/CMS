import { expect, test } from "bun:test";
import { pushFixture } from "./fixtures";

for (const events of [false, true]) {
    test(`an opaque receiver refusal reports commit context, correlation and ${events ? "a possible event incompatibility" : "no event hint"}`, async () => {
        const f = await pushFixture();
        const requestId = "f9274683-3c48-4d72-97bd-c2405666f75c";
        let commits = 0;
        let refuse = true;
        const proxy = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(request) {
                const url = new URL(request.url);
                if (request.method === "POST" && url.pathname.endsWith("/v1/uploads/commit")) {
                    commits++;
                    if (refuse) {
                        return Response.json(
                            {
                                error: {
                                    code: "REJECTED",
                                    output: { message: "The Repository artifact was refused. PRIVATE_SECRET" },
                                },
                            },
                            { status: 409, headers: { "x-ulvia-request-id": requestId } },
                        );
                    }
                }
                return fetch(new Request(new URL(url.pathname + url.search, f.server.url), request));
            },
        });
        try {
            await f.contract("cms.example", { events });
            await f.run(["release", f.source, "--recursive"]);
            await f.run(["repository", "login", proxy.url.origin]);
            const error = await f
                .run(["push", "all", "--repository", proxy.url.origin])
                .catch((cause: unknown) => cause);
            expect(error).toMatchObject({ name: "PublicationPushError" });
            const message = (error as Error).message;
            for (const expected of [
                "contract ulvia/cms.example@1.0.0",
                "0/1 completed",
                proxy.url.origin,
                "publication commit",
                "HTTP 409, REJECTED",
                requestId,
                "no recognized publication reason",
                "receiving Repository logs",
                "exact retries are idempotent",
            ]) {
                expect(message).toContain(expected);
            }
            expect(message).not.toContain("PRIVATE_SECRET");
            expect(message.includes("Possible cause:")).toBe(events);
            expect(commits).toBe(1);
            expect(await f.remoteFiles.list("contracts")).toEqual([]);
            refuse = false;
            await f.run(["push", "all", "--repository", proxy.url.origin]);
            expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
            await f.run(["push", "all", "--repository", proxy.url.origin]);
            expect(f.output.at(-2)).toStartWith("= contract");
            expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
        } finally {
            proxy.stop(true);
            await f.close();
        }
    });
}
