import type { ContractRelease } from "@bernouy/ulvia-contracts";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { CapabilityServices } from "ulvia-sdk/interfaces/execution";

export interface FeatureFixtureSource {
    readonly id: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array | Blob;
}

export type FeatureCapabilities<Capabilities extends readonly CapabilitySource[]> = {
    readonly [Capability in Capabilities[number] as Capability["id"]]: Capability;
};

/** The single authored source; contract releases are generated from its declarative fields. */
export interface FeatureDefinition<Capabilities extends readonly CapabilitySource[] = readonly CapabilitySource[]>
    extends Pick<ContractRelease, "contractId" | "name" | "publisherId" | "version" | "description" | "catalogue"> {
    readonly capabilities: Capabilities;
    readonly extends?: FeatureDefinition;
    readonly documents?: Readonly<Record<string, string>> | URL;
    readonly fixtures?: readonly FeatureFixtureSource[];
}

type Intersection<Union> = (Union extends unknown ? (services: Union) => void : never) extends (
    services: infer Services,
) => void
    ? Services
    : {};
type OwnServices<Feature extends FeatureDefinition> = [Feature["capabilities"][number]] extends [never]
    ? {}
    : Intersection<CapabilityServices<Feature["capabilities"][number]>>;

/** Child features inherit service requirements; separate capability contexts compose structurally. */
export type FeatureServices<Feature extends FeatureDefinition> = OwnServices<Feature> &
    (Feature extends {
        readonly extends: infer Parent extends FeatureDefinition;
    }
        ? FeatureServices<Parent>
        : {});

type Conflicts<Own, Parent> = {
    [Key in keyof Own & keyof Parent]: Own[Key] extends Parent[Key] ? never : Key;
}[keyof Own & keyof Parent];

export type FeatureServiceCompatibility<Feature extends FeatureDefinition> = Feature extends {
    readonly extends: infer Parent extends FeatureDefinition;
}
    ? [Conflicts<OwnServices<Feature>, FeatureServices<Parent>>] extends [never]
        ? unknown
        : { readonly extends: never }
    : unknown;
