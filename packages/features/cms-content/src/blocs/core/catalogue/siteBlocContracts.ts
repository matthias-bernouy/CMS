import { randomUUIDv7 } from "bun";
import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
import { ContentValidationError, SiteBlocNotFoundError } from "cms-content/application/core/validation/errors";
import { generateSiteBlocSourceBundle } from "cms-content/blocs/core/publication/source/generateSiteBlocSourceBundle";
import { serializeSiteBlocMarkup } from "cms-content/blocs/core/publication/source/siteBlocHtml";
import { siteBlocStructureFromMarkup } from "cms-content/blocs/core/catalogue/siteBlocMarkup";
import { validateSiteBlocSnapshot } from "cms-content/blocs/core/validation";
import type { BlocRecord, SiteBlocDefinition, SiteBlocSnapshot, TBlocWrite } from "cms-content/blocs/interfaces/blocs";

export type SiteBlocCreateInput = Readonly<{
    tag: string;
    name: string;
    group: string;
    description?: string;
    content: string;
    groupId?: string;
}>;

export type SiteBlocIdentityInput = Readonly<{ tag: string; revision: number }>;

export type CmsSiteBloc = Readonly<{
    tag: string;
    name: string;
    group: string;
    description: string;
    lifecycle: "active" | "archived";
    draftRevision: number;
    publishedRevision: number | null;
    createdAt: string;
    updatedAt: string;
}>;

export async function listCmsSiteBlocs(repository: Pick<ContentRepository, "getBlocRecords">) {
    const records = await repository.getBlocRecords();
    return {
        items: records
            .flatMap((record) => (record.siteDefinition ? [projectSiteBloc(record.siteDefinition)] : []))
            .sort((left, right) => left.name.localeCompare(right.name) || left.tag.localeCompare(right.tag)),
    };
}

export async function getCmsSiteBloc(repository: Pick<ContentRepository, "getBlocRecord">, input: { tag: string }) {
    const record = await repository.getBlocRecord(requireTag(input.tag));
    if (!record?.siteDefinition) {
        throw new SiteBlocNotFoundError(input.tag);
    }
    return projectSiteBloc(record.siteDefinition);
}

export async function createCmsSiteBloc(
    repository: Pick<ContentRepository, "createSiteBloc">,
    input: SiteBlocCreateInput,
): Promise<CmsSiteBloc> {
    const now = new Date();
    const id = randomUUIDv7();
    const tag = requireTag(input.tag);
    const draft = authoredSnapshot(input, tag);
    const record = await repository.createSiteBloc({
        schema: "cms.site-bloc.v1",
        id,
        tag,
        ownership: { kind: "site-builder", definitionId: id },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft,
        published: null,
        createdAt: now,
        updatedAt: now,
        ...(input.groupId?.trim() ? { groupId: input.groupId.trim() } : {}),
    });
    return projectRecord(record);
}

export async function publishCmsSiteBloc(
    repository: Pick<ContentRepository, "getBlocRecord" | "publishSiteBloc" | "withSiteBlocPublicationLock">,
    input: SiteBlocIdentityInput,
): Promise<CmsSiteBloc> {
    const tag = requireTag(input.tag);
    return repository.withSiteBlocPublicationLock(async (guard) => {
        const record = await requiredRecord(repository, tag);
        const definition = record.siteDefinition!;
        const published = await repository.publishSiteBloc(
            tag,
            siteBlocArtifact(definition),
            requireRevision(input.revision),
            undefined,
            guard,
        );
        return projectRecord(published);
    });
}

export async function setCmsSiteBlocArchived(
    repository: Pick<ContentRepository, "archiveSiteBloc" | "restoreSiteBloc">,
    input: SiteBlocIdentityInput,
    archived: boolean,
): Promise<CmsSiteBloc> {
    const tag = requireTag(input.tag);
    const revision = requireRevision(input.revision);
    const definition = archived
        ? await repository.archiveSiteBloc(tag, revision)
        : await repository.restoreSiteBloc(tag, revision);
    return projectSiteBloc(definition);
}

function authoredSnapshot(input: SiteBlocCreateInput, tag: string): SiteBlocSnapshot {
    if (typeof input.name !== "string" || typeof input.group !== "string") {
        throw new ContentValidationError("site Bloc", "name and group are required");
    }
    return validateSiteBlocSnapshot(
        {
            name: input.name,
            group: input.group,
            description: typeof input.description === "string" ? input.description : "",
            structure: siteBlocStructureFromMarkup(input.content),
            slots: [],
            defaultContent: "",
            dependencies: [],
        },
        tag,
    );
}

function siteBlocArtifact(definition: SiteBlocDefinition): TBlocWrite {
    const snapshot = definition.draft;
    const source = generateSiteBlocSourceBundle(definition, snapshot);
    return {
        id: definition.tag,
        kind: "composition",
        name: snapshot.name,
        group: snapshot.group,
        description: snapshot.description,
        uses: snapshot.dependencies,
        root: { accepts: ["div"] },
        viewJS: "",
        markupHTML: serializeSiteBlocMarkup(snapshot, { controller: false }),
        ownership: definition.ownership,
        source: Object.fromEntries(
            Object.entries(source).map(([path, contents]) => [path, Buffer.from(contents).toString("base64")]),
        ),
    };
}

function projectRecord(record: BlocRecord): CmsSiteBloc {
    if (!record.siteDefinition) {
        throw new SiteBlocNotFoundError(record.tag);
    }
    return projectSiteBloc(record.siteDefinition);
}

function projectSiteBloc(definition: SiteBlocDefinition): CmsSiteBloc {
    return {
        tag: definition.tag,
        name: definition.draft.name,
        group: definition.draft.group,
        description: definition.draft.description,
        lifecycle: definition.lifecycle,
        draftRevision: definition.draftRevision,
        publishedRevision: definition.publishedRevision,
        createdAt: definition.createdAt.toISOString(),
        updatedAt: definition.updatedAt.toISOString(),
    };
}

async function requiredRecord(repository: Pick<ContentRepository, "getBlocRecord">, tag: string): Promise<BlocRecord> {
    const record = await repository.getBlocRecord(tag);
    if (!record?.siteDefinition) {
        throw new SiteBlocNotFoundError(tag);
    }
    return record;
}

function requireTag(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new ContentValidationError("tag", "required");
    }
    return value.trim();
}

function requireRevision(value: unknown): number {
    if (!Number.isInteger(value) || Number(value) < 1) {
        throw new ContentValidationError("revision", "positive integer expected");
    }
    return Number(value);
}
