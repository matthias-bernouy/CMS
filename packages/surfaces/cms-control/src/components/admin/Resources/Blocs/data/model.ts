import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { IntegrationInstallationRow, IntegrationInstallationDetail } from "../../Integrations/model";

export type SiteCollection = { id: string; name: string; description: string };
export type BlocItem = {
    tag: string;
    name: string;
    description: string;
    group: string;
    collectionId?: string | null;
    origin: { kind: "site-builder" | "integration" | "code-managed"; installationId?: string };
    active: boolean;
    editable: boolean;
    editPath: string | null;
    state: "archived" | "published" | "draft";
    publishedRevision: number | null;
    usageCount: number;
    directDependencies: string[];
    usages: { pages: Array<{ id: string; label: string; path: string }>; blocs: Array<{ tag: string; label: string }> };
};
export type BlocCollection = {
    key: string;
    name: string;
    description: string;
    kind: "site" | "managed" | "code";
    siteId?: string;
    installation?: IntegrationInstallationRow;
    blocs: BlocItem[];
};
export type LibraryData = { collections: BlocCollection[]; blocs: BlocItem[] };
export type LibraryRoute = { view: "library" | "add" | "collection"; collection: string; bloc: string; query: string };
export type AvailableCollection = { kind: string; label: string; description: string; category: string };
export type CollectionDefinition = Extract<IntegrationDefinition, { type: "collection" }>;
export type ManagedDetail = IntegrationInstallationDetail & { definition: CollectionDefinition };
