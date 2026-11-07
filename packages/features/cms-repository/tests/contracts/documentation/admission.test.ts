import { expect, test } from "bun:test";
import { admitContractBundle, admitContractRelease, parseContractRelease } from "@bernouy/ulvia-contracts";
import { compareContractReleases } from "@bernouy/ulvia-contracts/compatibility";
import { parseDocumentationMarkdown } from "@bernouy/ulvia-contracts/documentation";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { MongoReleaseCatalogue } from "cms-repository/contracts/default-implementation/mongo/MongoReleaseCatalogue";
import { fakeCatalogueDb } from "../../support/fakeCatalogueDb";
import { documented } from "./fixtures";

test("Markdown requires one genuine H1, including setext, and never counts code or nested quote examples", () => {
    expect(parseDocumentationMarkdown("Title\n=====\n\n```md\n# Example\n```\n").title).toBe("Title");
    expect(parseDocumentationMarkdown("# **Actual** title\n\n> # Quoted\n").title).toBe("Actual title");
    for (const text of ["No title", "#\n", "# One\n\n# Two\n", "```md\n# Example\n```\n"]) {
        expect(() => parseDocumentationMarkdown(text)).toThrow();
    }
});

test("rejects dangling paths, duplicate documents and traversal before publication", async () => {
    const fixture = await documented();
    for (const path of ["../send.md", "/send.md", "a/../../send.md", "a\\send.md", "%2e%2e/send.md", "a//send.md"]) {
        expect(() =>
            parseContractRelease({ ...fixture.source, documentation: [{ ...fixture.document, path }] }),
        ).toThrow();
    }
    expect(() => parseContractRelease({ ...fixture.source, documentation: [] })).toThrow(
        "missing capability documentation",
    );
    expect(() =>
        parseContractRelease({ ...fixture.source, documentation: [fixture.document, fixture.document] }),
    ).toThrow("duplicate");
    const catalogue = new InMemoryReleaseCatalogue();
    await expect(catalogue.publish(await admitContractRelease(fixture.source))).rejects.toThrow();
    expect(await catalogue.list()).toHaveLength(0);
    await expect(
        admitContractBundle(fixture.source, [
            { id: "docs/guides/send.md", bytes: new TextEncoder().encode("# Changed\n") },
        ]),
    ).rejects.toThrow();
});

test("documents are editorial, preserve exact bytes and are absent from warm Mongo metadata reads", async () => {
    const first = await documented();
    const next = await documented("# Updated guide\n\nNew explanation.\n", { version: "1.0.1" });
    expect(compareContractReleases(first.admission.release, next.admission.release).requiredBump).toBe("patch");
    const db = fakeCatalogueDb();
    const mongo = new MongoReleaseCatalogue(db);
    await mongo.publish(first.admission);
    const recreated = new MongoReleaseCatalogue(db);
    const metadata = await recreated.get(first.admission.release.contractId, "1.0.0");
    expect(metadata?.admission.documentationAssets).toBeUndefined();
    expect(await (await recreated.readDocumentation(first.admission.digest, first.document.path))?.text()).toBe(
        new TextDecoder().decode(first.bytes),
    );
    const rejected = { ...next.admission, digest: first.admission.digest };
    await expect(recreated.publish(rejected)).rejects.toThrow();
    expect(await db.collection("cms_contract_documentation").find({}).toArray()).toHaveLength(1);
});

test("internal links and manifest titles are verified against immutable document bytes", async () => {
    await expect(documented("# Guide\n\n[Missing](missing.md)\n")).rejects.toThrow("missing internal");
    await expect(documented("# Guide\n\n[Escape](../../secret.md)\n")).rejects.toThrow("escapes");
    const fixture = await documented();
    await expect(
        admitContractBundle({ ...fixture.source, documentation: [{ ...fixture.document, title: "Wrong" }] }, [
            { id: "docs/guides/send.md", bytes: fixture.bytes },
        ]),
    ).rejects.toThrow("title disagrees");
});

test("Mongo documentation preserves UTF-8 BOM bytes across publication and recreation", async () => {
    const fixture = await documented("\uFEFF# Send a message\n\nExact UTF-8 bytes.\n");
    const db = fakeCatalogueDb();
    await new MongoReleaseCatalogue(db).publish(fixture.admission);
    const blob = await new MongoReleaseCatalogue(db).readDocumentation(fixture.admission.digest, fixture.document.path);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(fixture.bytes);
});
