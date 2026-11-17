import { createRequire } from "node:module";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { administrationControls, canonicalDigest } from "./model";

const workspace = createRequire("/app/packages/runtimes/ulvia-provider-server/package.json");
const { verifyStoredCollectionArtifact } = workspace("@bernouy/repository/collections");
const { LocalCollectionRepository, withRepositoryWriteLock } = workspace("@bernouy/repository/repository/filesystem");
const { canonicalizeIJson } = workspace("@bernouy/ulvia-contracts/protocol");
const compressed = new Uint8Array(await Bun.file(Bun.argv[2]!).arrayBuffer());
const input = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed)));
const assets = input.assets.map(({ id, base64 }: { id: string; base64: string }) => ({
    id,
    bytes: Buffer.from(base64, "base64"),
}));
const base = "/var/lib/cms/files";
const roots: string[] = [];
for (const entry of await readdir(base)) {
    const root = join(base, entry, "repository");
    if (
        await stat(join(root, "releases")).then(
            (value) => value.isDirectory(),
            () => false,
        )
    ) {
        roots.push(root);
    }
}
if (roots.length !== 1) {
    throw new Error("Fixture restoration requires exactly one isolated Registry");
}
await withRepositoryWriteLock(roots[0]!, async () => {
    const repository = new LocalCollectionRepository(roots[0]!);
    for (const release of [input.release, administrationControls(input.release)]) {
        const canonicalJson = canonicalizeIJson(release);
        const artifact = await verifyStoredCollectionArtifact(release, assets, canonicalDigest(canonicalJson));
        await repository.store(artifact);
    }
});
console.log("Restored pinned administration fixture and explicit controls");
