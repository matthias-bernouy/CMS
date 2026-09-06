import type { IntegrationInstallationRow } from "../../Integrations/model";
import type { BlocCollection, BlocItem, SiteCollection } from "./model";

export function collectBlocs(
    sites: SiteCollection[],
    blocs: BlocItem[],
    installations: IntegrationInstallationRow[],
): BlocCollection[] {
    const collections: BlocCollection[] = sites.map((site) => ({
        key: `site:${site.id}`,
        siteId: site.id,
        name: site.name,
        description: site.description,
        kind: "site",
        blocs: blocs.filter((bloc) => bloc.origin.kind === "site-builder" && (bloc.collectionId ?? "site") === site.id),
    }));
    const owners = new Set([
        ...installations.filter((item) => item.integrationType === "collection").map((item) => item.id),
        ...blocs.flatMap((bloc) => (bloc.origin.installationId ? [bloc.origin.installationId] : [])),
    ]);
    for (const id of owners) {
        const installation = installations.find((item) => item.id === id);
        collections.push({
            key: `managed:${id}`,
            name: installation?.label ?? id,
            kind: "managed",
            installation,
            description: installation
                ? "A managed collection of reusable blocs."
                : "The blocs are preserved, but their managed collection is unavailable.",
            blocs: blocs.filter((bloc) => bloc.origin.installationId === id),
        });
    }
    const code = blocs.filter((bloc) => bloc.origin.kind === "code-managed");
    if (code.length) {
        collections.push({
            key: "code",
            name: "Custom code",
            description: "Blocs maintained in your codebase.",
            kind: "code",
            blocs: code,
        });
    }
    return collections;
}

export function collectionLabel(collection: BlocCollection): string {
    return collection.kind === "site"
        ? "Site collection"
        : collection.kind === "managed"
          ? "Managed collection"
          : "Code collection";
}
