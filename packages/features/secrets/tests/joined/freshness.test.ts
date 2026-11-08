import { expect, test } from "bun:test";
import { joinedFixture } from "./fixture";

test("named snapshots are freshly read and never cache values, rotations or revocations", async () => {
    const f = await joinedFixture();
    expect((await f.read())?.value).toBe("initial");
    expect((await f.read())?.value).toBe("initial");
    expect(f.stats).toEqual({ captures: 2, plaintextReads: 2 });
    await f.secrets.rotate(f.owner.namespaceId, f.owner.namespaceKey, f.secret.secretId, 1, "rotated");
    expect(await f.read()).toMatchObject({ value: "rotated", version: 2 });
    const replacement = await f.secrets.rotateNamespaceKey(f.owner.namespaceId, f.owner.namespaceKey, f.owner.keyId);
    await expect(f.read()).rejects.toThrow();
    expect((await f.read(replacement.namespaceKey))?.value).toBe("rotated");
    await f.secrets.revokeNamespaceKey(f.owner.namespaceId, replacement.namespaceKey, replacement.keyId);
    await expect(f.read(replacement.namespaceKey)).rejects.toThrow();
    expect(f.stats.plaintextReads).toBe(4);
});

test("missing metadata, missing values and storage failures cannot reuse a previous result", async () => {
    const f = await joinedFixture();
    expect(await f.read(f.owner.namespaceKey, f.owner.namespaceId, "MISSING")).toBeNull();
    expect(f.stats.plaintextReads).toBe(0);
    expect((await f.read())?.value).toBe("initial");
    f.failure = new Error("storage unavailable");
    await expect(f.read()).rejects.toThrow("storage unavailable");
    expect(f.stats.plaintextReads).toBe(1);
    f.failure = undefined;
    const metadata = await f.metadata.findByName(f.owner.namespaceId, "TOKEN");
    await f.values.delete(metadata!.storageKey);
    await expect(f.read()).rejects.toThrow("secret value is unavailable");
    await f.metadata.delete(metadata!.id, metadata!.version);
    expect(await f.read()).toBeNull();
    await f.secrets.revokeNamespaceKey(f.owner.namespaceId, f.owner.namespaceKey, f.owner.keyId);
    await expect(f.read()).rejects.toThrow();
});
