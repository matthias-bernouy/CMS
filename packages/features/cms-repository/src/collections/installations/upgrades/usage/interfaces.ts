import type { CollectionCapabilityRequirement, CollectionResourceKind } from "../../../interfaces/CollectionRelease";

export type ResourceUse = Readonly<{
    type: "resource";
    collectionId: string;
    kind: CollectionResourceKind | "setting";
    id: string;
    location: string;
    scope: "catalogue" | "runtime";
}>;
export type CapabilityUse = Readonly<
    Omit<CollectionCapabilityRequirement, "versionRange"> & {
        versionRange?: string;
        type: "capability";
        location: string;
        scope: "catalogue" | "runtime";
    }
>;
export type BindingUse = Readonly<{
    type: "binding";
    contractId: string;
    bindingPath: string;
    location: string;
    scope: "catalogue" | "runtime";
}>;
export type UsageReference = ResourceUse | CapabilityUse | BindingUse;
export type UsageContributor = Readonly<{
    id: string;
    snapshot(siteId: string): Promise<
        Readonly<{
            revision: string;
            complete: boolean;
            references: readonly UsageReference[];
            unknown?: readonly string[];
        }>
    >;
}>;
export type UsageInventory = Readonly<{
    siteId: string;
    complete: boolean;
    references: readonly UsageReference[];
    unknown: readonly string[];
    revisions: Readonly<Record<string, string>>;
    digest: string;
}>;
