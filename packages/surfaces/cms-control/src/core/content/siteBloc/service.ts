import { randomUUIDv7 } from "bun";
import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import {
    BlocRevisionConflictError,
    nextSiteBlocUpdatedAt,
    SiteBlocNotFoundError,
    type SiteBlocDefinition,
    type SiteBlocSnapshot,
    type TBloc,
    validateSiteBlocSnapshot,
} from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/content/bloc/importBlocArtifact";
import { snapshotFromEditor, validateSiteBlocDraft } from "cms-control/core/content/siteBloc/validation/draft";

export type CreateSiteBlocInput = { tag: string; name: string; group: string; description: string };

export type SaveSiteBlocInput = {
    expectedDraftRevision: number;
    name: string;
    group: string;
    description: string;
    defaultContent: string;
    structureHtml?: string;
    snapshot?: SiteBlocSnapshot;
};

export async function createSiteBloc(cms: ControlCms, input: CreateSiteBlocInput): Promise<SiteBlocDefinition> {
    const now = new Date();
    const id = randomUUIDv7();
    const draft = validateSiteBlocSnapshot(
        {
            name: input.name,
            group: input.group,
            description: input.description,
            structure: [],
            slots: [],
            defaultContent: "",
            dependencies: [],
        },
        input.tag,
    );
    const definition: SiteBlocDefinition = {
        schema: "cms.site-bloc.v1",
        id,
        tag: input.tag,
        ownership: { kind: "site-builder", definitionId: id },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft,
        published: null,
        createdAt: now,
        updatedAt: now,
    };
    const record = await cms.repository.createSiteBloc(definition);
    return record.siteDefinition!;
}

export async function saveSiteBloc(
    cms: ControlCms,
    tag: string,
    input: SaveSiteBlocInput,
): Promise<SiteBlocDefinition> {
    const definition = await requireSiteBloc(cms, tag);
    const snapshot = input.snapshot ?? snapshotFromEditor(input, tag);
    const validated = await validateSiteBlocDraft(cms, definition, snapshot);
    return cms.repository.saveSiteBlocDraft(tag, validated, input.expectedDraftRevision);
}

export async function previewSiteBloc(cms: ControlCms, tag: string, expectedRevision?: number): Promise<TBloc> {
    const definition = await requireSiteBloc(cms, tag);
    if (expectedRevision !== undefined && definition.draftRevision !== expectedRevision) {
        throw new BlocRevisionConflictError(tag, expectedRevision, definition.draftRevision);
    }
    const snapshot = await validateSiteBlocDraft(cms, definition, definition.draft);
    return buildSiteBlocArtifact(cms, projectedPublication(definition, snapshot));
}

export async function publishSiteBloc(
    cms: ControlCms,
    tag: string,
    expectedRevision: number,
): Promise<SiteBlocDefinition> {
    return cms.repository.withSiteBlocPublicationLock(async (guard) => {
        const definition = await requireSiteBloc(cms, tag);
        if (definition.draftRevision !== expectedRevision) {
            throw new BlocRevisionConflictError(tag, expectedRevision, definition.draftRevision);
        }
        const snapshot = await validateSiteBlocDraft(cms, definition, definition.draft);
        const publicationDate = nextSiteBlocUpdatedAt(definition.updatedAt);
        const projected = projectedPublication(definition, snapshot, publicationDate);
        let published: SiteBlocDefinition | null = null;
        await buildSiteBlocArtifact(cms, projected, async (artifact) => {
            await guard.assertHeld();
            const record = await cms.repository.publishSiteBloc(
                tag,
                artifact,
                expectedRevision,
                publicationDate,
                guard,
            );
            published = record.siteDefinition ?? null;
        });
        if (!published) {
            throw new Error(`Site bloc "${tag}" publication did not persist a definition`);
        }
        return published;
    });
}

export async function requireSiteBloc(cms: ControlCms, tag: string): Promise<SiteBlocDefinition> {
    const record = await cms.repository.getBlocRecord(tag);
    if (!record?.siteDefinition || record.ownership.kind !== "site-builder") {
        throw new SiteBlocNotFoundError(tag);
    }
    return record.siteDefinition;
}

function projectedPublication(
    definition: SiteBlocDefinition,
    draft: SiteBlocSnapshot,
    updatedAt = definition.updatedAt,
): SiteBlocDefinition {
    return {
        ...structuredClone(definition),
        draft: structuredClone(draft),
        publishedRevision: definition.draftRevision,
        published: structuredClone(draft),
        updatedAt,
    };
}

async function buildSiteBlocArtifact(
    cms: ControlCms,
    definition: SiteBlocDefinition,
    persist?: (artifact: TBloc) => Promise<void>,
): Promise<TBloc> {
    const bundle = generateSiteBlocSourceBundle(definition, definition.draft);
    const source = Object.fromEntries(
        Object.entries(bundle).map(([path, content]) => [path, Buffer.from(content).toString("base64")]),
    );
    let artifact: TBloc | null = null;
    await importBlocArtifact(
        cms,
        {
            tag: definition.tag,
            name: definition.draft.name,
            group: definition.draft.group,
            description: definition.draft.description,
            viewJS: bundle["Bloc.ts"],
            editorJS: bundle["BlocEditor.ts"],
            source,
            force: true,
        },
        {
            ownership: definition.ownership,
            invalidate: persist !== undefined,
            persist: async (compiled) => {
                artifact = compiled;
                await persist?.(compiled);
            },
        },
    );
    if (!artifact) {
        throw new Error(`Site bloc "${definition.tag}" compilation produced no artifact`);
    }
    return artifact;
}
