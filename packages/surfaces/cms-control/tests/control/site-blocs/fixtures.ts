import {
    InMemoryCmsRepository,
    type SiteBlocDefinition,
    type SiteBlocSnapshot,
    type TBloc,
} from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";

export class SiteBlocTestRepository extends InMemoryCmsRepository {
    seedLegacyClaimable(tag: string): void {
        const artifact = blocArtifact(tag);
        this.blocs.set(tag, {
            tag,
            ownership: { kind: "code-managed" },
            legacyOwnershipClaim: "unclaimed",
            artifact,
        } as never);
    }
}

export class RecordingCache {
    readonly deleted: string[] = [];
    readonly keys = new Set<string>();

    delete(key: string): void {
        this.deleted.push(key);
        this.keys.delete(key);
    }

    deleteMatching(predicate: (key: string) => boolean): void {
        for (const key of [...this.keys]) {
            if (predicate(key)) {
                this.delete(key);
            }
        }
    }

    reset(): void {
        this.deleted.length = 0;
    }
}

export function siteBlocHarness() {
    const repository = new SiteBlocTestRepository();
    const cache = new RecordingCache();
    const cms = { repository, cache } as unknown as ControlCms;
    return { cms, repository, cache };
}

export function blocArtifact(tag: string, overrides: Partial<TBloc> = {}): TBloc {
    return {
        id: tag,
        name: tag,
        group: "Basic",
        description: `${tag} description`,
        viewJS: `globalThis[${JSON.stringify(`view:${tag}`)}] = true;`,
        editorJS: `globalThis[${JSON.stringify(`editor:${tag}`)}] = true;`,
        ownership: { kind: "code-managed" },
        ...overrides,
    };
}

export async function seedBloc(
    repository: InMemoryCmsRepository,
    tag: string,
    overrides: Partial<TBloc> = {},
): Promise<TBloc> {
    return repository.createBloc(blocArtifact(tag, overrides));
}

export function siteSnapshot(overrides: Partial<SiteBlocSnapshot> = {}): SiteBlocSnapshot {
    return {
        name: "Site composition",
        group: "Site",
        description: "A site-owned composition",
        structure: [],
        slots: [],
        defaultContent: "",
        dependencies: [],
        ...overrides,
    };
}

export function siteDefinition(tag: string, overrides: Partial<SiteBlocDefinition> = {}): SiteBlocDefinition {
    const id = `definition-${tag}`;
    const now = new Date("2026-07-27T10:00:00.000Z");
    return {
        schema: "cms.site-bloc.v1",
        id,
        tag,
        ownership: { kind: "site-builder", definitionId: id },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft: siteSnapshot(),
        published: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

export async function seedSiteBloc(
    repository: InMemoryCmsRepository,
    tag: string,
    snapshot = siteSnapshot(),
): Promise<SiteBlocDefinition> {
    const definition = siteDefinition(tag, { draft: snapshot });
    await repository.createSiteBloc(definition);
    return definition;
}

export async function seedPublishedSiteBloc(
    repository: InMemoryCmsRepository,
    tag: string,
    snapshot = siteSnapshot(),
    artifactOverrides: Partial<TBloc> = {},
): Promise<SiteBlocDefinition> {
    const definition = await seedSiteBloc(repository, tag, snapshot);
    const record = await repository.publishSiteBloc(
        tag,
        blocArtifact(tag, { ownership: definition.ownership, ...artifactOverrides }),
        definition.draftRevision,
    );
    return record.siteDefinition!;
}

export function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
    return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
