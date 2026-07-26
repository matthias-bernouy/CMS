import type { BuiltOfficialIntegrationCandidate } from "@bernouy/cms-official-integrations/publication";

const servers: Bun.Server<unknown>[] = [];

export const CANDIDATE: BuiltOfficialIntegrationCandidate = {
    kind: "demo",
    version: "1.1.0",
    packageDigest: "a".repeat(64),
    verificationDigest: "b".repeat(64),
    candidateDigest: "c".repeat(64),
    canonicalBytes: new TextEncoder().encode('{"schema":"cms.integration.candidate.v1"}'),
};

export function stopCandidateClientServers(): void {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
}

export function candidateProjection(status: string) {
    return {
        candidateId: "candidate-1",
        status,
        kind: CANDIDATE.kind,
        version: CANDIDATE.version,
        candidateDigest: CANDIDATE.candidateDigest,
        packageDigest: CANDIDATE.packageDigest,
        verificationDigest: CANDIDATE.verificationDigest,
    };
}

export function serveCandidateClient(
    fetchHandler: (request: Request) => Response | Promise<Response>,
): Bun.Server<unknown> {
    const server = Bun.serve({ port: 0, fetch: fetchHandler });
    servers.push(server);
    return server;
}

export function candidateClientConfig(server: Bun.Server<unknown>) {
    return {
        managementUrl: `${candidateServerOrigin(server)}/.cms/repository-management`,
        token: "management-token",
        timeoutMs: 500,
        pollIntervalMs: 1,
        wait: async () => undefined,
    };
}

export function candidateServerOrigin(server: Bun.Server<unknown>): string {
    return `http://127.0.0.1:${server.port}`;
}

export function candidateJson(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
