import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import type { BlocListItemResponse, CmsRepository, SiteBlocDefinition } from "@bernouy/cms-content";

const PUBLISHED_SOURCE_FILES = ["manifest.json", "Bloc.ts", "BlocEditor.ts", "template.html", "default.html"] as const;

export async function cliBlocList(repository: CmsRepository): Promise<BlocListItemResponse[]> {
    return (await repository.getBlocRecords()).flatMap((record) => {
        const metadata = record.siteDefinition?.draft ?? record.artifact;
        if (!metadata) {
            return [];
        }
        return [
            {
                id: record.tag,
                name: metadata.name,
                group: metadata.group,
                description: metadata.description,
                ownership: structuredClone(record.ownership),
                ...(record.artifact?.thumbnail ? { thumbnail: structuredClone(record.artifact.thumbnail) } : {}),
            },
        ];
    });
}

export async function cliBlocSource(repository: CmsRepository, tag: string): Promise<Record<string, string> | null> {
    const record = await repository.getBlocRecord(tag);
    if (!record) {
        return null;
    }
    if (!record.siteDefinition) {
        const source = record.artifact?.source;
        return source ? structuredClone(source) : null;
    }
    return siteBuilderSource(record.siteDefinition, record.artifact?.source);
}

function siteBuilderSource(
    definition: SiteBlocDefinition,
    publishedSource?: Record<string, string>,
): Record<string, string> {
    const generated = encodeBundle(generateSiteBlocSourceBundle(definition, definition.published ?? definition.draft));
    return {
        ...Object.fromEntries(PUBLISHED_SOURCE_FILES.map((path) => [path, publishedSource?.[path] ?? generated[path]])),
        "builder.json": generated["builder.json"]!,
    };
}

function encodeBundle(bundle: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(bundle).map(([path, content]) => [path, Buffer.from(content, "utf-8").toString("base64")]),
    );
}
