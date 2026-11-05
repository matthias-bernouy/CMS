import { expect, test } from "bun:test";
import { documentationProcesses } from "./native";
import { connectBrowser } from "../oauth";
import { collectionJourney } from "./scenarios/collection";
import { collectionUpgrade } from "./scenarios/upgrade";
import { concurrentEditing } from "./scenarios/editing";
import { discoveryJourney } from "./scenarios/discovery";
import { instanceIsolation } from "./scenarios/isolation";
import { stage } from "./scenarios/client";

const integration = process.env.ULVIA_RUN_DOCUMENTATION_NATIVE === "1" ? test : test.skip;

integration(
    "complex MCP workflows recover from interruptions, conflicts and targeted revocation",
    async () => {
        const f = await documentationProcesses();
        const connections: Awaited<ReturnType<typeof connectBrowser>>[] = [];
        try {
            const options = { executablePath: process.env.ULVIA_DOCUMENTATION_CHROMIUM };
            const primary = await connectBrowser(f.cmsUrl, f.administrator, options);
            connections.push(primary);
            await stage("Collection sources → private asset → restart → publication → installation → browser", () =>
                collectionJourney(primary, f.cmsUrl, f.restartProvider),
            );
            await stage("Collection upgrade → stale plan → asynchronous error → reviewed retry → idempotency", () =>
                collectionUpgrade(primary, f.cmsUrl),
            );
            await stage(
                "Concurrent authors → conflict → refusal without mutation → merge → publication → withdrawal",
                () => concurrentEditing(primary, f.cmsUrl),
            );
            await stage("Multilingual discovery → direct reads → malformed paths → legacy resources", () =>
                f.waitForDocumentation().then(() => discoveryJourney(primary)),
            );
            const neighbourInstance = await f.createNeighbour();
            const neighbour = await connectBrowser(neighbourInstance.cmsUrl, neighbourInstance.administrator, options);
            connections.push(neighbour);
            await stage("Separate instance → foreign page, OAuth token, upload and file-signing refusals", () =>
                instanceIsolation(primary, neighbour, f.cmsUrl, neighbourInstance.cmsUrl),
            );
            const secondary = await connectBrowser(f.cmsUrl, f.administrator, options);
            connections.push(secondary);
            await secondary.revoke();
            expect(
                (
                    await fetch(`${f.cmsUrl}/.cms/mcp`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${secondary.token.access_token}` },
                        body: "{}",
                    })
                ).status,
            ).toBe(401);
            expect(
                (
                    await primary.call("ulvia/cms.installations", "documentation.search", {
                        query: "verify page",
                        contractId: "ulvia/cms.content",
                    })
                ).results.length,
            ).toBeGreaterThan(0);
            await primary.revoke();
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            for (const connection of connections) {
                await connection.browser.close();
            }
            await f.close();
            expect(f.processOutcomes().filter((outcome) => outcome.nativeCrash)).toEqual([]);
            expect(f.processOutcomes().every((outcome) => outcome.exitCode === 0)).toBe(true);
        }
    },
    300_000,
);
