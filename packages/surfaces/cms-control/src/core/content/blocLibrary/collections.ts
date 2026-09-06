import type { SiteBlocCollection } from "@bernouy/cms-content";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import type { LibraryBloc, LibraryCollection } from "./types";
import { collectionAssets } from "./assets";

export function libraryCollectionRows(
    sites: SiteBlocCollection[],
    blocs: LibraryBloc[],
    installations: IntegrationInstallation[],
    selected: string | undefined,
    basePath: string,
): LibraryCollection[] {
    const rows: LibraryCollection[] = sites.map((site) =>
        row(
            {
                key: `site:${site.id}`,
                name: site.name,
                description: site.description,
                kind: "site",
                siteId: site.id,
                icon: site.icon ?? "folder",
            },
            selected,
            basePath,
        ),
    );
    const owners = new Set([
        ...installations
            .filter(({ definitionSnapshot }) => definitionSnapshot?.type === "collection")
            .map(({ id }) => id),
        ...blocs.flatMap(({ origin }) => (origin.kind === "integration" ? [origin.installationId] : [])),
    ]);
    for (const id of owners) {
        const installation = installations.find((item) => item.id === id);
        const definition = installation?.definitionSnapshot;
        const managed = definition?.schema === "cms.integration.definition.v2" && definition.type === "collection";
        rows.push(
            row(
                {
                    key: `managed:${id}`,
                    name: installation?.label ?? id,
                    kind: "managed",
                    description:
                        definition?.description ??
                        (installation
                            ? "A managed collection of reusable blocs."
                            : "Its managed installation is unavailable. Existing blocs are preserved."),
                    ...(installation
                        ? {
                              installationId: id,
                              status: installation.status,
                              statusLabel:
                                  installation.status === "success"
                                      ? "Active"
                                      : installation.status === "pending"
                                        ? "Pending"
                                        : "Failed",
                              version: installation.definitionVersion,
                          }
                        : {}),
                    canCheckUpdates: managed && installation?.status === "success",
                    canManageAvailability: managed && installation?.status !== "pending",
                    ...collectionAssets(basePath, definition, installation?.definitionVersion),
                },
                selected,
                basePath,
            ),
        );
    }
    if (blocs.some(({ origin }) => origin.kind === "code-managed")) {
        rows.push(
            row(
                { key: "code", name: "Custom code", description: "Blocs maintained in your codebase.", kind: "code" },
                selected,
                basePath,
            ),
        );
    }
    return rows.map((collection) => {
        const blocCount = blocs.filter((bloc) => belongsToCollection(bloc, collection)).length;
        const noun = collection.isSite ? "composition" : "bloc";
        return { ...collection, blocCount, countLabel: `${blocCount} ${noun}${blocCount === 1 ? "" : "s"}` };
    });
}

function row(
    fields: Pick<LibraryCollection, "key" | "name" | "description" | "kind"> & Partial<LibraryCollection>,
    selected: string | undefined,
    basePath: string,
): LibraryCollection {
    return {
        blocCount: 0,
        countLabel: "",
        isSite: fields.kind === "site",
        isManaged: fields.kind === "managed",
        isCode: fields.kind === "code",
        href: `${basePath}/admin/blocs?collection=${encodeURIComponent(fields.key)}`,
        active: fields.key === selected,
        canCheckUpdates: false,
        canManageAvailability: false,
        ...fields,
    };
}

export function belongsToCollection(bloc: LibraryBloc, collection: LibraryCollection): boolean {
    if (collection.isSite) {
        return bloc.origin.kind === "site-builder" && (bloc.collectionId ?? "site") === collection.siteId;
    }
    if (collection.isManaged) {
        return bloc.origin.kind === "integration" && `managed:${bloc.origin.installationId}` === collection.key;
    }
    return bloc.origin.kind === "code-managed";
}

export function matchingCollections(
    collections: LibraryCollection[],
    blocs: LibraryBloc[],
    search = "",
): LibraryCollection[] {
    const query = search.trim().toLowerCase();
    return collections.filter(
        (collection) =>
            !query ||
            [
                collection.name,
                collection.description,
                ...blocs
                    .filter((bloc) => belongsToCollection(bloc, collection))
                    .flatMap(({ name, group, tag }) => [name, group, tag]),
            ].some((value) => value.toLowerCase().includes(query)),
    );
}
