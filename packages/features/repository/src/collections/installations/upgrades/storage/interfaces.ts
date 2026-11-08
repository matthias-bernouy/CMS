import type { CollectionInstallation } from "../../interfaces/store";
import type { CollectionUpgradeTarget } from "../interfaces";
import type { SiteUpgradeIntent } from "repository/site-upgrades/interfaces";
export type CollectionUpgradePayload = Readonly<{
    targets: readonly CollectionUpgradeTarget[];
    replacements: readonly CollectionInstallation[];
}>;
export type UpgradeIntent = SiteUpgradeIntent<CollectionUpgradePayload>;
