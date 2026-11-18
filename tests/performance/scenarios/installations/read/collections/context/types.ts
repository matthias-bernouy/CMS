import type { CollectionReadResource } from "../resources/collection";
import type { registryCalls } from "../../../../repository/client";
import type { FreshTenant } from "../../../fresh";

export type CollectionCorpusRegistry = Readonly<{
    calls: ReturnType<typeof registryCalls>;
    origin: string;
    claim(): Promise<Readonly<{ namespace: string; revision: number }>>;
    publish(resource: CollectionReadResource, namespaceRevision: number): Promise<void>;
    resources: CollectionReadResource[];
    close(): Promise<void>;
}>;
export type CollectionReadState = Readonly<{
    tenant: FreshTenant;
    registry: CollectionCorpusRegistry;
    repositoryId: string;
    namespace: string;
    resources: CollectionReadResource[];
    installed: Map<string, CollectionReadResource>;
    upgrades: Readonly<{ upgradeId: string; operationId: string; revision: number }>[];
    revision(): number;
    title(): string;
    create(index: number, patch: number): Promise<CollectionReadResource>;
    publish(resource: CollectionReadResource): Promise<void>;
    install(resources: readonly CollectionReadResource[]): Promise<void>;
    upgrade(resource: CollectionReadResource): Promise<void>;
    configure(title: string): Promise<void>;
    close(): Promise<void>;
}>;
