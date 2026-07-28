import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH,
    buildOfficialIntegrationVerificationBackfill,
    loadOfficialIntegrationVerificationBackfill,
    verificationObjectRelativePath,
} from "@bernouy/cms-official-integrations/publication";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official verification backfill storage", () => {
    test("rejects non-canonical, duplicate, and digest-tampered committed documents", async () => {
        const generated = await buildOfficialIntegrationVerificationBackfill();
        const nonCanonicalRoot = await temporaryRoot("jcs");
        await writeIndex(nonCanonicalRoot, `${new TextDecoder().decode(generated.indexCanonicalBytes)}\n`);
        await expect(loadOfficialIntegrationVerificationBackfill(nonCanonicalRoot)).rejects.toThrow(/canonical JSON/);

        const duplicateRoot = await temporaryRoot("duplicate");
        const duplicate = new TextDecoder()
            .decode(generated.indexCanonicalBytes)
            .replace(
                '"schema":"cms.integration.official-verification-backfill.v1"',
                '"schema":"cms.integration.official-verification-backfill.v1","schema":"cms.integration.official-verification-backfill.v1"',
            );
        await writeIndex(duplicateRoot, duplicate);
        await expect(loadOfficialIntegrationVerificationBackfill(duplicateRoot)).rejects.toThrow(/duplicate property/);

        const digestRoot = await temporaryRoot("digest");
        const original = generated.verifications[0]!;
        await writeIndex(digestRoot, singleEntryIndex(generated));
        const objectPath = verificationPath(digestRoot, original.verificationDigest);
        await mkdir(dirname(objectPath), { recursive: true });
        await writeFile(
            objectPath,
            canonicalJsonBytes({ ...original.envelope, files: { "tampered.txt": { encoding: "utf8", content: "x" } } }),
        );
        await expect(loadOfficialIntegrationVerificationBackfill(digestRoot)).rejects.toThrow(
            /differs from its exact backfill binding/,
        );
    });

    test("does not follow a symlinked index or verification object", async () => {
        const generated = await buildOfficialIntegrationVerificationBackfill();
        const targetRoot = await temporaryRoot("symlink-target");
        await writeIndex(targetRoot, generated.indexCanonicalBytes);

        const indexLinkRoot = await temporaryRoot("symlink-index");
        const indexLink = join(indexLinkRoot, OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH);
        await mkdir(dirname(indexLink), { recursive: true });
        await symlink(join(targetRoot, OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH), indexLink);
        await expect(loadOfficialIntegrationVerificationBackfill(indexLinkRoot)).rejects.toThrow();

        const objectLinkRoot = await temporaryRoot("symlink-object");
        const original = generated.verifications[0]!;
        await writeIndex(objectLinkRoot, singleEntryIndex(generated));
        const objectTarget = verificationPath(targetRoot, original.verificationDigest);
        await mkdir(dirname(objectTarget), { recursive: true });
        await writeFile(objectTarget, original.canonicalBytes);
        const objectLink = verificationPath(objectLinkRoot, original.verificationDigest);
        await mkdir(dirname(objectLink), { recursive: true });
        await symlink(objectTarget, objectLink);
        await expect(loadOfficialIntegrationVerificationBackfill(objectLinkRoot)).rejects.toThrow();
    });
});

type BuiltBackfill = Awaited<ReturnType<typeof buildOfficialIntegrationVerificationBackfill>>;

function singleEntryIndex(backfill: BuiltBackfill): Uint8Array {
    return canonicalJsonBytes({ ...backfill.index, entries: [backfill.index.entries[0]!] });
}

function verificationPath(root: string, digest: string): string {
    return join(root, verificationObjectRelativePath(digest));
}

async function temporaryRoot(label: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), `cms-official-verification-${label}-`));
    temporaryRoots.push(root);
    for (const group of ["domains", "extensions", "foundation", "providers"]) {
        await cp(join(OFFICIAL_INTEGRATIONS_ROOT, group), join(root, group), { recursive: true });
    }
    return root;
}

async function writeIndex(root: string, contents: string | Uint8Array): Promise<void> {
    const path = join(root, OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
}
