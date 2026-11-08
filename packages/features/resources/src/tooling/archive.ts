import { defaultThemeSettings, validateThemeSettings, validateBlocWrite } from "@bernouy/content";
import { validatePageDocument, analyzeExpandedPageDocument } from "@bernouy/content/page-document";
import { sha256Digest } from "@bernouy/binary-media";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { writeResourceArchive } from "resources/artifacts/archive/write";
import { localeSchema } from "resources/artifacts/archive/schemas";
import type { PreparedResourceSource, ResourceSourceBuildOptions } from "./interfaces";
import { localizedBloc, localizedTheme } from "./localization";
import { translate } from "./source/metadata";
import { validateSourceBindings } from "./state/bindings";

/** Compose captured ordinary sources into one verified ZIP; services and browser code never execute. */
export async function buildResourceArchive(
    sources: readonly PreparedResourceSource[],
    options: ResourceSourceBuildOptions,
) {
    const locale = localeSchema.parse(options.locale);
    if (
        !sources.length ||
        sources.length > 32 ||
        new Set(sources.map(({ namespace }) => namespace)).size !== sources.length
    ) {
        throw new TypeError("Resource sources must have unique bounded namespaces");
    }
    const capabilities = options.contracts.flatMap((contract) =>
        contract.capabilities.map(({ definition }) => ({
            contractId: contract.release.contractId,
            capabilityId: definition.id,
            input: definition.input,
            output: definition.output,
            errors: definition.errors,
        })),
    );
    const blocs = sources.flatMap((source) =>
        source.blocs.map((bloc) => validateBlocWrite(localizedBloc(bloc, source, locale))),
    );
    const definitions = blocs.map((bloc) => ({ ...bloc, slots: bloc.slots ?? {}, markup: bloc.markupHTML }));
    for (const source of sources) {
        validateSourceBindings(source, sources, capabilities);
    }
    const pages = sources.flatMap((source) =>
        source.pages
            .filter((page) => !options.omitPages?.get(source.namespace)?.has(page.path))
            .map((page) => ({
                ...page,
                title: translate(source, page.title, locale),
                description: page.description ? translate(source, page.description, locale) : "",
            })),
    );
    for (const page of [
        ...pages,
        ...sources.flatMap((source) => source.examples.map((example) => ({ path: example.path, html: example.html }))),
    ]) {
        validatePageDocument(page.html, definitions, { capabilities, requireCapabilityResolution: true });
        const analysis = analyzeExpandedPageDocument(page.html, definitions, false);
        const failure = analysis.diagnostics.find(({ severity }) => severity === "error");
        if (failure) {
            throw new TypeError(`${page.path}: ${failure.message}`);
        }
    }
    for (const requirement of [
        ...blocs.flatMap((bloc) => bloc.requires ?? []),
        ...pages.flatMap((page) => page.requires ?? []),
    ]) {
        const contract = options.contracts.find((contract) => contract.release.contractId === requirement.contractId);
        if (
            !contract ||
            !satisfiesVersionRange(contract.release.version, requirement.versionRange) ||
            !contract.capabilities.some(({ definition }) => definition.id === requirement.capabilityId)
        ) {
            throw new TypeError("Resource requirement is not supplied by the selected contracts");
        }
    }
    const theme = defaultThemeSettings();
    theme.sources.push(
        ...sources.flatMap((source) => (source.theme ? [localizedTheme(source.theme, source, locale)] : [])),
    );
    const assets = (
        await Promise.all(
            sources.map(async (source, index) =>
                Promise.all(
                    source.assets.map(async (asset) => ({
                        namespace: source.namespace,
                        id: asset.id,
                        entry: `assets/${index}/${asset.id}`,
                        mediaType: asset.mediaType,
                        byteLength: asset.bytes.size,
                        digest: await sha256Digest(new Uint8Array(await asset.bytes.arrayBuffer())),
                        ...(asset.profiles ? { profiles: [...asset.profiles] } : {}),
                    })),
                ),
            ),
        )
    ).flat();
    const document = {
        format: "ulvia-resources/v1",
        blocs: JSON.parse(JSON.stringify(blocs)),
        theme: validateThemeSettings(theme),
        assets,
        pages,
        texts: sources.map((source) => ({
            namespace: source.namespace,
            locale: source.locale,
            texts: source.texts.map((text) => ({
                ...text,
                category: translate(source, text.category, locale),
                group: translate(source, text.group, locale),
                label: translate(source, text.label, locale),
                ...(text.description ? { description: translate(source, text.description, locale) } : {}),
            })),
        })),
    };
    return writeResourceArchive({
        document,
        assets: sources.flatMap((source, index) =>
            source.assets.map((asset) => ({ path: `assets/${index}/${asset.id}`, bytes: asset.bytes })),
        ),
    });
}
