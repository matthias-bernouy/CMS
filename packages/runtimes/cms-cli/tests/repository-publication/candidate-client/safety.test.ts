import { afterEach, describe, expect, test } from "bun:test";
import { publishOfficialIntegrationCandidate } from "../../../src/repositoryPublication/candidate/client";
import {
    CANDIDATE,
    candidateClientConfig,
    candidateJson,
    candidateServerOrigin,
    serveCandidateClient,
    stopCandidateClientServers,
} from "./fixtures";

afterEach(stopCandidateClientServers);

describe("official repository candidate HTTP safety", () => {
    test("bounds responses, enforces JSON, times out, and refuses redirects", async () => {
        const oversized = serveCandidateClient(
            () => new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } }),
        );
        expect(await publishOfficialIntegrationCandidate(candidateClientConfig(oversized), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 200,
        });
        const wrongType = serveCandidateClient(() => new Response("{}", { headers: { "content-type": "text/plain" } }));
        expect(await publishOfficialIntegrationCandidate(candidateClientConfig(wrongType), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 200,
        });
        const delayed = serveCandidateClient(async () => {
            await Bun.sleep(50);
            return candidateJson(404, {});
        });
        expect(
            await publishOfficialIntegrationCandidate({ ...candidateClientConfig(delayed), timeoutMs: 5 }, CANDIDATE),
        ).toEqual({ outcome: "failed", reason: "timeout" });

        let targetCalls = 0;
        const target = serveCandidateClient(() => {
            targetCalls += 1;
            return candidateJson(200, {});
        });
        const redirect = serveCandidateClient(() => Response.redirect(`${candidateServerOrigin(target)}/capture`, 302));
        expect(await publishOfficialIntegrationCandidate(candidateClientConfig(redirect), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "transport",
        });
        expect(targetCalls).toBe(0);
    });
});
