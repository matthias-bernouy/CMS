import { expect, test } from "bun:test";
import { BlocRevisionConflictError, type SiteBlocDefinition } from "@bernouy/cms-content";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsRepository } from "cms-cli/dev-server/repo/LocalFsCmsRepository";
import { generateSiteBlocBuilderSource } from "cms-cli/push/blocs/siteBuilder";

test("site-builder definitions round-trip without allowing a foreign owner", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
    const repository = new LocalFsCmsRepository(siteDir, new Map());
    const definition = siteDefinition();
    await repository.createSiteBloc(definition);

    const draftRecord = await repository.getBlocRecord(definition.tag);
    expect(draftRecord?.artifact).toBeNull();
    expect(draftRecord?.siteDefinition).toEqual(definition);
    const saved = await repository.saveSiteBlocDraft(
        definition.tag,
        { ...definition.draft, name: "Updated site shell" },
        definition.draftRevision,
    );
    expect(saved.draftRevision).toBe(2);

    const published = await repository.publishSiteBloc(
        definition.tag,
        {
            id: definition.tag,
            name: saved.draft.name,
            group: saved.draft.group,
            description: saved.draft.description,
            viewJS: "untrusted generated output",
            editorJS: "untrusted generated output",
            ownership: definition.ownership,
        },
        saved.draftRevision,
    );
    expect(published.siteDefinition?.published).toEqual(saved.draft);
    expect(published.artifact?.viewJS).not.toContain("untrusted generated output");

    const source = await repository.getBlocSource(definition.tag);
    expect(Object.keys(source ?? {}).sort()).toEqual([
        "Bloc.ts",
        "BlocEditor.ts",
        "builder.json",
        "default.html",
        "manifest.json",
        "template.html",
    ]);
    expect(Buffer.from(source!["builder.json"]!, "base64").toString("utf-8")).toContain('"schema": "cms.site-bloc.v1"');

    await expect(
        repository.replaceBloc({ ...published.artifact!, ownership: { kind: "code-managed" } }),
    ).rejects.toThrow("belongs to a different owner");
});

test("a code-managed source cannot claim site-builder ownership through builder.json", async () => {
    const repository = new LocalFsCmsRepository(mkdtempSync(join(tmpdir(), "p9r-dev-repo-")), new Map());
    const definition = siteDefinition();

    await expect(
        repository.createBloc({
            id: definition.tag,
            name: "Smuggled shell",
            group: "Layout",
            description: "",
            viewJS: "",
            editorJS: "",
            ownership: { kind: "code-managed" },
            source: { "builder.json": generateSiteBlocBuilderSource(definition) },
        }),
    ).rejects.toThrow("builder.json is reserved for site-builder blocs");
    expect(await repository.getBlocRecord(definition.tag)).toBeNull();
});

test("concurrent local draft writers with one expected revision have exactly one winner", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
    const definition = siteDefinition();
    await new LocalFsCmsRepository(siteDir, new Map()).createSiteBloc(definition);
    const firstRepository = new LocalFsCmsRepository(siteDir, new Map());
    const secondRepository = new LocalFsCmsRepository(siteDir, new Map());

    const outcomes = await Promise.allSettled([
        firstRepository.saveSiteBlocDraft(
            definition.tag,
            { ...definition.draft, name: "First concurrent draft" },
            definition.draftRevision,
        ),
        secondRepository.saveSiteBlocDraft(
            definition.tag,
            { ...definition.draft, name: "Second concurrent draft" },
            definition.draftRevision,
        ),
    ]);
    const winners = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const conflicts = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toBeInstanceOf(BlocRevisionConflictError);
    const record = await firstRepository.getBlocRecord(definition.tag);
    expect(record?.siteDefinition?.draftRevision).toBe(2);
    expect(record?.siteDefinition?.draft.name).toBe(winners[0]?.value.draft.name);
});

test("serializes the local publication graph across repository instances", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
    const firstRepository = new LocalFsCmsRepository(siteDir, new Map());
    const secondRepository = new LocalFsCmsRepository(siteDir, new Map());
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });

    const first = firstRepository.withSiteBlocPublicationLock(async (guard) => {
        events.push("first:start");
        await firstCanFinish;
        await guard.assertHeld();
        events.push("first:end");
    });
    while (events.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const second = secondRepository.withSiteBlocPublicationLock(async () => {
        events.push("second:start");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
});

function siteDefinition(): SiteBlocDefinition {
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-site-shell",
        tag: "site-shell",
        ownership: { kind: "site-builder", definitionId: "definition-site-shell" },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft: {
            name: "Site shell",
            group: "Layout",
            description: "Site-owned shell",
            structure: [{ kind: "slot", slotId: "content" }],
            slots: [{ id: "content", label: "Content", accepts: [{ kind: "any-component" }] }],
            defaultContent: "<p>Default content</p>",
            dependencies: [],
        },
        published: null,
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
        updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    };
}
