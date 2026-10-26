import type { ContentRepository } from "@bernouy/cms-content";
import { assertContentRefsExist } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import type { UsageSnapshot } from "../usage/snapshot";
import { localBlocDocuments } from "../usage/localDocuments";
import type { UpgradeIssue } from "../interfaces";

export async function validateUpgradeContent(
    repository: ContentRepository,
    snapshot: UsageSnapshot,
    releases: readonly CollectionRelease[],
): Promise<UpgradeIssue[]> {
    const installedIds = new Set(
        snapshot.installed.collections.flatMap(({ release }) => release.blocs.map(({ id }) => id)),
    );
    const current = await repository.getBlocsList({ includeHidden: true });
    const targetBlocs = releases.flatMap((release) =>
        release.blocs.map((bloc) => ({
            id: bloc.id,
            root: bloc.root,
            kind: bloc.kind,
            slots: bloc.slots,
            uses: bloc.uses,
            markupHTML: bloc.markup,
            ...(bloc.kind === "component" ? { settings: bloc.settings } : {}),
        })),
    );
    const finalBlocs = [...current.filter((bloc) => !installedIds.has(bloc.id)), ...targetBlocs];
    const issues: UpgradeIssue[] = [];
    const documents = snapshot.pages.map((page) => ({ location: `page:${page.id}:${page.path}`, html: page.content }));
    for (const record of snapshot.records.filter(({ contributionId }) => !contributionId)) {
        for (const [name, html] of Object.entries(localBlocDocuments(record))) {
            documents.push({ location: `local-bloc:${record.tag}/${name}`, html });
        }
    }
    for (const { location, html } of documents) {
        try {
            await assertContentRefsExist({ getBlocsList: async () => finalBlocs }, html);
        } catch (error) {
            issues.push({
                code: "incompatible-content",
                location,
                message: error instanceof Error ? error.message : "Content is incompatible with the target releases",
            });
        }
    }
    return issues;
}
