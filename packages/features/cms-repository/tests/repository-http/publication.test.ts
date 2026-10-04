import { expect, test } from "bun:test";
import {
    encodePublication,
    InMemoryRepositoryReplayStore,
    RepositoryMutationEndpoint,
    signRepositoryRequest,
    type PublicationEnvelope,
    type RemoteCoordinate,
    type RepositoryPublicationRegistry,
} from "@bernouy/cms-repository/repository/publication";

test("a shared replay store rejects one signature across endpoint instances", async () => {
    const registry = new RecordingRegistry();
    const replays = new InMemoryRepositoryReplayStore();
    const token = "a".repeat(32);
    const url = new URL("https://repository.example/v1/publications");
    const body = encodePublication({ kind: "provider-manifest", canonicalJson: "{}", assets: [] });
    const signed = signRepositoryRequest("POST", url, body, token);
    const request = () =>
        new Request(url, {
            method: "POST",
            body,
            headers: {
                Authorization: signed.authorization,
                "X-Ulvia-Timestamp": signed.timestamp,
                "X-Ulvia-Nonce": signed.nonce,
                "X-Ulvia-Content-SHA256": signed.contentDigest,
                "X-Ulvia-Signature": signed.signature,
            },
        });

    const first = new RepositoryMutationEndpoint(registry, token, replays);
    const second = new RepositoryMutationEndpoint(registry, token, replays);
    expect((await first.handle(request()))?.status).toBe(200);
    expect((await second.handle(request()))?.status).toBe(401);
    expect(registry.publications).toHaveLength(1);
});

class RecordingRegistry implements RepositoryPublicationRegistry {
    readonly publications: PublicationEnvelope[] = [];

    async publish(envelope: PublicationEnvelope) {
        this.publications.push(envelope);
        return { kind: envelope.kind, added: true, digest: `sha256:${"0".repeat(64)}`, release: {} };
    }

    async setYank(coordinate: RemoteCoordinate, reason: string | null) {
        return {
            ...coordinate,
            yank: reason ? { reason, yankedAt: new Date(0).toISOString() } : null,
        };
    }
}
