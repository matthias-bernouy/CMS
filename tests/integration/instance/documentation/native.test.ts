import { expect, test } from "bun:test";
import { documentationProcesses } from "./native";
import { connectBrowser } from "../oauth";
import { exerciseDocumentation } from "./flow";
import { exerciseFiles } from "../collections";

const integration = process.env.ULVIA_RUN_DOCUMENTATION_NATIVE === "1" ? test : test.skip;

integration(
    "real native Mongo, Repository, Provider, Edge and browser MCP preserve documentation and authorization across restart",
    async () => {
        const f = await documentationProcesses();
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            connection = await connectBrowser(f.cmsUrl, f.administrator, {
                executablePath: process.env.ULVIA_DOCUMENTATION_CHROMIUM,
            });
            expect(connection.tools).toHaveLength(68);
            await f.waitForDocumentation();
            const found = await connection.call("ulvia/cms.installations", "repository.search", {
                query: "ulvia/cms.content",
                kinds: ["contract"],
            });
            expect(found.partial).toBe(false);
            expect(found.results[0]?.reference.id).toBe("ulvia/cms.content");
            const inspected = await connection.call("ulvia/cms.installations", "repository.get", {
                repositoryId: found.results[0].repositoryId,
                reference: found.results[0].reference,
            });
            expect(inspected.reference).toEqual(found.results[0].reference);
            expect(inspected.content).toContain('"kind": "contract"');
            const blocs = await connection.call("ulvia/cms.installations", "repository.search", {
                query: "ulvia/mossa",
                kinds: ["bloc"],
                limit: 1,
            });
            expect(blocs.partial).toBe(false);
            expect(blocs.results[0]?.blocId).toBeString();
            const bloc = await connection.call("ulvia/cms.installations", "repository.get", {
                repositoryId: blocs.results[0].repositoryId,
                reference: blocs.results[0].reference,
                blocId: blocs.results[0].blocId,
            });
            expect(bloc.content).toContain(blocs.results[0].blocId);
            const result = await exerciseDocumentation(connection, f.cmsUrl);
            await exerciseFiles(connection.call, f.cmsUrl, connection.token.access_token);
            await f.restartProvider();
            await f.waitForDocumentation();
            const document = await connection.call("ulvia/cms.installations", "documentation.get", {
                reference: result.reference,
            });
            expect(document.content).toBe(result.content);
            const search = await connection.call("ulvia/cms.installations", "documentation.search", {
                query: "How do I verify a page before publication?",
                contractId: "ulvia/cms.content",
            });
            expect(
                search.results.some(
                    (item: { reference: { path: string } }) => item.reference.path === "pages/verify.md",
                ),
            ).toBe(true);
            console.log("Documentation retrieval after Provider restart:", search.mode);
            expect((await connection.call("ulvia/cms.content", "pages.get", { id: result.pageId })).title).toBe(
                "Verified documentation review",
            );
            await connection.revoke();
            expect(
                (
                    await fetch(`${f.cmsUrl}/.cms/mcp`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${connection.token.access_token}` },
                        body: "{}",
                    })
                ).status,
            ).toBe(401);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await f.close();
            expect(f.processOutcomes().filter((outcome) => outcome.nativeCrash)).toEqual([]);
        }
    },
    240_000,
);
