import { expect, test } from "bun:test";
import { documentationProcesses } from "../native";
import { connectBrowser } from "../../oauth";
import { clearDerivedVectors, searchProbe } from "./requests";
import { invoke, operation } from "../scenarios/client";

const integration = process.env.ULVIA_RUN_DOCUMENTATION_COLD === "1" ? test : test.skip;

integration(
    "background documentation preparation removes passage inference from filtered and restarted lookups",
    async () => {
        const f = await documentationProcesses();
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        const phases: Record<string, unknown>[] = [];
        try {
            const first = await f.waitForDocumentation();
            expect(first.embedded).toBe(first.chunks);
            expect(first.chunks).toBeGreaterThan(0);
            connection = await connectBrowser(f.cmsUrl, f.administrator, {
                executablePath: process.env.ULVIA_DOCUMENTATION_CHROMIUM,
            });
            const probe = (filtered: boolean) =>
                Promise.all([0, 1, 2].map((index) => searchProbe(connection!, f.cmsUrl, index, filtered)));
            const verify = (requests: Awaited<ReturnType<typeof probe>>) => {
                for (const result of requests) {
                    expect(result.status).toBe(200);
                    expect(result.error).toBeNull();
                    expect(result.isError).toBe(false);
                    expect(result.mode).toBe("hybrid");
                    expect(result.results).toBeGreaterThan(0);
                }
            };
            for (const filtered of [false, true]) {
                const requests = await probe(filtered);
                verify(requests);
                phases.push({
                    phase: filtered ? "prepared-distinct-filters" : "prepared-unfiltered",
                    preparation: first,
                    requests,
                });
            }
            await f.restartProvider();
            const cached = await f.waitForDocumentation();
            expect(cached).toMatchObject({ embedded: 0, reused: first.chunks });
            const restarted = await probe(true);
            verify(restarted);
            phases.push({ phase: "restart-with-persisted-vectors", preparation: cached, requests: restarted });
            let removedVectors = 0;
            await f.restartProvider(async () => {
                removedVectors = await clearDerivedVectors(f.mongoUrl);
            });
            const during = await probe(false);
            expect(during.every((result) => result.status === 200 && !result.isError)).toBe(true);
            const rebuilt = await f.waitForDocumentation();
            expect(rebuilt).toMatchObject({ embedded: first.chunks, reused: 0 });
            const after = await probe(true);
            verify(after);
            phases.push({
                phase: "rebuild-after-cache-deletion",
                removedVectors,
                preparation: rebuilt,
                during,
                requests: after,
            });
            const listing = await connection.page.request.get(
                `${f.cmsUrl}/.cms/query/ulvia.cms.installations/list-provider-installations`,
            );
            expect(listing.status()).toBe(200);
            const providers = await listing.json();
            const plan = await connection.call("ulvia.cms.installations", "plan-contract-upgrade", {
                selections: providers.selections,
            });
            if (plan.status !== "applicable") {
                throw new Error(`Selection plan refused: ${JSON.stringify(plan.issues)}`);
            }
            const beforeCommit = (await f.documentationPreparations()).length;
            const reply = await invoke(
                connection,
                "ulvia.cms.installations",
                "apply-contract-upgrade",
                {
                    selections: plan.selections,
                    grants: plan.grants,
                    planDigest: plan.planDigest,
                },
                "documentation-preparation-selection",
            );
            expect(reply.isError).not.toBe(true);
            const accepted = reply.structuredContent.output;
            expect((await operation(connection, accepted.operationId)).status).toBe("succeeded");
            const committed = await f.waitForDocumentation(beforeCommit, String(plan.expectedRevision + 1));
            expect(committed).toMatchObject({
                revision: String(plan.expectedRevision + 1),
                embedded: 0,
                reused: first.chunks,
            });
            phases.push({ phase: "selection-commit-with-unchanged-documents", preparation: committed });
            console.log(JSON.stringify({ modelFiles: "populated cache", inferenceThreads: 2, phases }, null, 2));
        } catch (error) {
            console.error("PRIMARY_FAILURE", String(error), JSON.stringify(phases));
            throw new Error(`${String(error)}\n${JSON.stringify(phases)}\n${await f.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await f.close();
            console.log("PROCESS_OUTCOMES", JSON.stringify(f.processOutcomes()));
            expect(f.processOutcomes().filter((outcome) => outcome.nativeCrash)).toEqual([]);
            expect(f.processOutcomes().every((outcome) => outcome.exitCode === 0)).toBe(true);
        }
    },
    240_000,
);
