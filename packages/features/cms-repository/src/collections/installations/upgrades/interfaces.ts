import type { CollectionInstallation } from "../interfaces/store";
import type { LifecycleResource } from "../../core/validation/lifecycle/resources";
import type { UsageInventory } from "./usage/interfaces";

export type CollectionUpgradeTarget = Readonly<{
    digest: string;
    repositoryId?: string;
    configuration?: Readonly<Record<string, unknown>>;
    textOverrides?: CollectionInstallation["textOverrides"];
}>;
export type UpgradeIssue = Readonly<{
    code:
        | "missing-resource"
        | "incompatible-content"
        | "invalid-configuration"
        | "invalid-dependency"
        | "invalid-capability"
        | "incomplete";
    location: string;
    message: string;
    replacement?: string;
}>;
export type CollectionResourceChange = Readonly<{
    collectionId: string;
    kind: LifecycleResource["kind"];
    id: string;
    change: "added" | "removed" | "deprecated";
    replacement?: string;
}>;
export type CollectionUpgradePlan = Readonly<{
    siteId: string;
    status: "applicable" | "blocked" | "incomplete";
    expectedRevision: number;
    source: readonly Readonly<{ collectionId: string; version: string; digest: string }>[];
    targets: readonly CollectionUpgradeTarget[];
    replacements: readonly CollectionInstallation[];
    resources: readonly CollectionResourceChange[];
    issues: readonly UpgradeIssue[];
    inventory: UsageInventory;
    revisions: Readonly<Record<string, string>>;
    planDigest: string;
}>;
