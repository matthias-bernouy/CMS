import { expect, test } from "bun:test";
import { RepositoryConnection } from "@bernouy/cms-repository/repository/namespaces";

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
