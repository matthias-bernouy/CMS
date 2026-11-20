import type { ControlAuthority } from "hosting/core/ControlAuthority";
import type { DomainRegistry } from "hosting/core/domains/DomainRegistry";
import type { InstanceManagement } from "hosting/core/InstanceManagement";
import type { ZoneRegistry } from "hosting/core/zones/ZoneRegistry";
import type { PrimaryDomainManagement } from "hosting/core/domains/PrimaryDomainElection";

export interface HostingServices {
    readonly hosting: {
        readonly authority: Pick<ControlAuthority, "assertAdministrator">;
        readonly instances: Pick<InstanceManagement, "create" | "get" | "list" | "disable">;
        readonly domains: Pick<DomainRegistry, "claim" | "verify" | "list" | "disable">;
        readonly zones: Pick<ZoneRegistry, "claim" | "verify" | "list" | "disable">;
        readonly primaryDomains: Pick<PrimaryDomainManagement, "elect">;
    };
}
