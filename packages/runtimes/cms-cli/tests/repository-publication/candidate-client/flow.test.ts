import { afterEach, describe, expect, test } from "bun:test";
import { publishOfficialIntegrationCandidate } from "../../../src/repositoryPublication/candidate/client";
import {
    CANDIDATE,
    candidateClientConfig,
    candidateJson,
    candidateProjection,
    serveCandidateClient,
    stopCandidateClientServers,
} from "./fixtures";

afterEach(stopCandidateClientServers);

describe("official repository candidate HTTP flow", () => {
    test("submits canonical candidate bytes and polls the exact identity until published", async () => {
        const requests: Array<{ method: string; path: string; authorization: string | null; body: string }> = [];
        let statusReads = 0;
        const server = serveCandidateClient(async (request) => {
            const url = new URL(request.url);
            requests.push({
                method: request.method,
                path: `${url.pathname}${url.search}`,
                authorization: request.headers.get("authorization"),
                body: request.method === "POST" ? await request.text() : "",
            });
            if (url.pathname.endsWith("/versions")) {
                return candidateJson(404, { code: "integration_not_found" });
            }
            if (request.method === "POST") {
                return candidateJson(202, { candidate: candidateProjection("queued") });
            }
            statusReads += 1;
            return candidateJson(200, {
                candidate: candidateProjection(statusReads === 1 ? "running" : "published"),
            });
        });

        const result = await publishOfficialIntegrationCandidate(candidateClientConfig(server), CANDIDATE);

        expect(result).toEqual({ outcome: "published", candidateId: "candidate-1" });
        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
            "GET /.cms/repository-management/api/integrations/versions?kind=demo",
            "POST /.cms/repository-management/api/integrations/candidates",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
        ]);
        expect(requests.every(({ authorization }) => authorization === "Bearer management-token")).toBe(true);
        expect(requests[1]?.body).toBe(new TextDecoder().decode(CANDIDATE.canonicalBytes));
    });

    test("is idempotent only for the exact package with a current admissible decision", async () => {
        for (const [digest, verificationDigest, verificationOrigin, admissible, status, expected] of [
            [
                CANDIDATE.packageDigest,
                CANDIDATE.verificationDigest,
                "admission",
                true,
                undefined,
                { outcome: "unchanged" },
            ],
            [
                CANDIDATE.packageDigest,
                CANDIDATE.verificationDigest,
                "admission",
                false,
                undefined,
                { outcome: "failed", reason: "rejected", status: 422, code: "release_not_admissible" },
            ],
            [
                CANDIDATE.packageDigest,
                undefined,
                undefined,
                true,
                undefined,
                { outcome: "failed", reason: "rejected", status: 422, code: "release_not_admissible" },
            ],
            [
                "d".repeat(64),
                CANDIDATE.verificationDigest,
                "admission",
                true,
                undefined,
                { outcome: "failed", reason: "conflict", status: 409, code: "integration_version_exists" },
            ],
            [
                CANDIDATE.packageDigest,
                "e".repeat(64),
                "admission",
                true,
                undefined,
                { outcome: "failed", reason: "conflict", status: 409, code: "integration_version_exists" },
            ],
            [CANDIDATE.packageDigest, "e".repeat(64), "legacy-backfill", true, undefined, { outcome: "unchanged" }],
            [
                CANDIDATE.packageDigest,
                "not-a-digest",
                "legacy-backfill",
                true,
                undefined,
                { outcome: "failed", reason: "invalid-response", status: 200 },
            ],
            [
                CANDIDATE.packageDigest,
                CANDIDATE.verificationDigest,
                "admission",
                true,
                "unverified",
                { outcome: "failed", reason: "rejected", status: 422, code: "release_not_admissible" },
            ],
        ] as const) {
            const server = serveCandidateClient(() =>
                candidateJson(200, {
                    kind: CANDIDATE.kind,
                    versions: [
                        {
                            version: CANDIDATE.version,
                            digest,
                            ...(status ? { status } : {}),
                            release: {
                                admissible,
                                ...(verificationDigest ? { verificationDigest } : {}),
                                ...(verificationOrigin ? { verificationOrigin } : {}),
                            },
                        },
                    ],
                }),
            );
            expect(await publishOfficialIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual(
                expected,
            );
        }
    });

    test("returns a sanitized candidate rejection without polling", async () => {
        const server = serveCandidateClient((request) =>
            new URL(request.url).pathname.endsWith("/versions")
                ? candidateJson(404, { code: "integration_not_found" })
                : candidateJson(202, {
                      candidate: {
                          ...candidateProjection("rejected"),
                          lastFailure: {
                              kind: "validation",
                              code: "breaking_release_mislabeled",
                              message: "filesystem management-secret",
                          },
                      },
                  }),
        );

        expect(await publishOfficialIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "rejected",
            status: 422,
            code: "breaking_release_mislabeled",
        });
    });
});
