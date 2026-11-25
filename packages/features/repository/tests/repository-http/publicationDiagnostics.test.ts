import { expect, test } from "bun:test";
import { RepositoryConnection } from "repository/repository/publication/transport/connection";

test("publication diagnostics reconstruct only declared safe reasons and resource identities", async () => {
    const connection = new RepositoryConnection("https://repository.example");
    for (const publicationResource of [
        { kind: "bloc", id: "community--sample--panel" },
        { kind: "bloc", id: "private\nsecret" },
    ]) {
        try {
            await connection.readJson(
                Response.json(
                    {
                        error: {
                            code: "REJECTED",
                            output: {
                                publicationCode: "minor_required",
                                publicationResource,
                                message: "Private server path or credential must not be forwarded",
                            },
                        },
                    },
                    { status: 409 },
                ),
            );
            throw new Error("Expected business refusal");
        } catch (error) {
            expect(error).toMatchObject({ code: "REJECTED", publicationCode: "minor_required" });
            expect((error as Error).message).toContain("minor version");
            expect((error as Error).message).not.toContain("Private server");
            expect((error as Error).message).not.toContain("secret");
        }
    }
});

test("unknown remote codes and technical diagnostics do not become trusted publication guidance", async () => {
    const connection = new RepositoryConnection("https://repository.example");
    for (const status of [409, 503]) {
        try {
            await connection.readJson(
                Response.json(
                    {
                        error: {
                            code: "REJECTED",
                            output: { publicationCode: "__proto__", message: "private secret" },
                        },
                    },
                    { status },
                ),
            );
            throw new Error("Expected refusal");
        } catch (error) {
            expect((error as Error).message).not.toContain("private secret");
            expect(error).not.toHaveProperty("publicationCode", "__proto__");
        }
    }
});

test("generic refusals preserve HTTP facts and correlation without forwarding server messages", async () => {
    const connection = new RepositoryConnection("https://repository.example");
    const requestId = "f9274683-3c48-4d72-97bd-c2405666f75c";
    for (const status of [400, 401, 403, 404, 409, 413]) {
        const failure = connection.readJson(
            Response.json(
                {
                    error: {
                        code: "REJECTED",
                        output: { message: "private path /credentials/password and raw secret" },
                    },
                },
                { status, headers: { "x-ulvia-request-id": requestId } },
            ),
            undefined,
            "publication commit",
        );
        await expect(failure).rejects.toMatchObject({
            code: "REJECTED",
            response: { status, remoteCode: "REJECTED", requestId, phase: "publication commit" },
        });
        await expect(failure).rejects.toThrow(`HTTP ${status}, REJECTED; request ID ${requestId}`);
        await expect(failure).rejects.toThrow("publication commit");
        await expect(failure).rejects.not.toThrow("raw secret");
    }
});

test("malformed, oversized and undeclared diagnostics cannot replace the HTTP failure", async () => {
    const connection = new RepositoryConnection("https://repository.example");
    for (const body of [
        '{"error":',
        "x".repeat(5000),
        '{"error":{"code":"private-code","output":{"message":"secret"}}}',
    ]) {
        const error = await connection
            .readJson(
                new Response(body, {
                    status: 409,
                    headers: { "content-type": "application/json", "x-ulvia-request-id": "../../private-secret" },
                }),
            )
            .catch((cause: unknown) => cause);
        expect(error).toMatchObject({ code: "REJECTED", response: { status: 409 } });
        expect((error as Error).message).not.toContain("private");
        expect((error as Error).message).not.toContain("secret");
        expect((error as Error).message).toContain("no recognized publication reason");
    }
});
