import { expect, test } from "bun:test";
import { prepareImagePublication, remoteImageIdentity } from "../../../../infra/images/registry";
import { image, registryFixture } from "./fixture";

test("Docker publication verifies missing tags, publishes once and reconciles an uncertain push", async () => {
    const f = registryFixture();
    const publication = await prepareImagePublication([image], f);
    await expect(publication.verify()).rejects.toThrow("runtime phase first");
    f.loseReply();
    await publication.publish();
    await publication.verify();
    await publication.publish();
    expect(f.writes).toEqual([`docker push ${image.reference}`]);
});

test("different remote content and registry errors refuse without a push", async () => {
    for (const status of [0, 401, 403, 429, 503]) {
        const f = registryFixture();
        if (status) {
            f.refuse(status);
        } else {
            f.put(f.runtime(`sha256:${"b".repeat(64)}`));
        }
        await expect(prepareImagePublication([image], f)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    }
});

test("an OCI index resolves its one runtime by digest and ignores foreign descriptor URLs", async () => {
    const f = registryFixture();
    const runtime = f.put(f.runtime(), "runtime");
    const descriptor = {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: runtime.digest,
        size: runtime.size,
        urls: ["https://foreign.example/steal"],
    };
    f.put({
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.index.v1+json",
        manifests: [
            descriptor,
            {
                ...descriptor,
                digest: `sha256:${"c".repeat(64)}`,
                platform: { os: "unknown", architecture: "unknown" },
                annotations: {
                    "vnd.docker.reference.type": "attestation-manifest",
                    "vnd.docker.reference.digest": runtime.digest,
                },
            },
        ],
    });
    expect(await remoteImageIdentity(image, f.fetch)).toBe(image.id);
    expect(f.requests).toHaveLength(3);
    expect(f.requests.some((url) => url.includes("foreign.example"))).toBe(false);
});

test.each(["multi-platform", "missing-child", "wrong-size", "wrong-attestation"])(
    "%s cannot prove the built image identity",
    async (mode) => {
        const f = registryFixture();
        const runtime = f.put(f.runtime(), "runtime");
        const descriptor = {
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            digest: runtime.digest,
            size: runtime.size,
        };
        const manifests: unknown[] = [descriptor];
        if (mode === "multi-platform") {
            manifests.push(descriptor);
        }
        if (mode === "missing-child") {
            f.documents.delete(runtime.digest);
        }
        if (mode === "wrong-size") {
            descriptor.size++;
        }
        if (mode === "wrong-attestation") {
            manifests.push({
                ...descriptor,
                annotations: {
                    "vnd.docker.reference.type": "attestation-manifest",
                    "vnd.docker.reference.digest": `sha256:${"c".repeat(64)}`,
                },
            });
        }
        f.put({ schemaVersion: 2, mediaType: "application/vnd.oci.image.index.v1+json", manifests });
        await expect(remoteImageIdentity(image, f.fetch)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    },
);

test("forged coordinates and malformed missing-image responses never authorize writes", async () => {
    const f = registryFixture();
    await expect(remoteImageIdentity({ ...image, reference: "https://foreign.example" }, f.fetch)).rejects.toThrow(
        "coordinate",
    );
    expect(f.requests).toEqual([]);
    for (const body of [{ errors: [{ code: "UNAUTHORIZED" }] }, { errors: [null] }, { error: "not found" }]) {
        await expect(
            remoteImageIdentity(image, async (url, init) =>
                url.startsWith("https://auth.docker.io") ? f.fetch(url, init) : Response.json(body, { status: 404 }),
            ),
        ).rejects.toThrow();
    }
});

test("a manifest whose content digest does not match cannot satisfy runtime verification", async () => {
    const f = registryFixture();
    const response = f.put(f.runtime());
    await expect(
        remoteImageIdentity(image, async (url, init) =>
            url.startsWith("https://auth.docker.io")
                ? f.fetch(url, init)
                : new Response(response.body, { headers: { "docker-content-digest": `sha256:${"b".repeat(64)}` } }),
        ),
    ).rejects.toThrow("digest");
});

test("a retagged local image refuses before any Docker push", async () => {
    const f = registryFixture();
    const publication = await prepareImagePublication([image], {
        fetch: f.fetch,
        run: async () => `sha256:${"b".repeat(64)}`,
    });
    await expect(publication.publish()).rejects.toThrow("changed before push");
    expect(f.writes).toEqual([]);
    expect(f.documents.size).toBe(0);
});
