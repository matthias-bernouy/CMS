import type { ExampleResource } from "../resource/publish";

/** Controlled DTOs for harness tests; real admission and real readers are exercised separately. */
export function unitExampleResource(base: ExampleResource, patch: number): ExampleResource {
    const version = `1.0.${patch}`;
    return {
        ...base,
        version,
        digest: `sha256:${(patch + 1).toString(16).padStart(64, "0")}` as ExampleResource["digest"],
        release: {
            ...base.release,
            version,
            examples: base.release.examples!.map((example) => ({
                ...example,
                document: { html: example.document.html.replaceAll("Version 1.0.0", `Version ${version}`) },
            })),
        },
    };
}

export function unitExampleOutput(
    resource: ExampleResource,
    revision: number,
    capability: string,
    input: Readonly<Record<string, unknown>>,
) {
    if (capability === "examples.get") {
        const document = resource.release.examples!.find((example) => example.id === input.exampleId)!.document;
        return { collectionId: resource.id, id: input.exampleId, document };
    }
    const offset = Number(input.offset ?? input.cursor ?? 0);
    const limit = Number(input.limit ?? 50);
    const french = input.locale === "fr";
    return {
        revision,
        collectionId: resource.id,
        items: resource.release.examples!.slice(offset, offset + limit).map((example) => ({
            id: example.id,
            label:
                example.id === "panel"
                    ? "Panel"
                    : french
                      ? `Exemple de performance ${resource.version}`
                      : `Performance example ${resource.version}`,
            description:
                example.id === "panel"
                    ? "Panel"
                    : french
                      ? `Exemple contrôlé ${resource.version}`
                      : `Controlled example ${resource.version}`,
            previews: example.previews,
        })),
        total: resource.release.examples!.length,
        offset,
        limit,
        locale: input.locale,
        nextCursor: offset + limit < resource.release.examples!.length ? String(offset + limit) : "",
    };
}
