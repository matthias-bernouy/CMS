import type { ControlAuthority } from "hosting/core/ControlAuthority";
import type { DomainRegistry } from "hosting/core/domains/DomainRegistry";
import type { InstanceManagement } from "hosting/core/InstanceManagement";

export interface HostingServices {
    readonly hosting: {
        readonly authority: Pick<ControlAuthority, "assertAdministrator">;
        readonly instances: Pick<InstanceManagement, "create" | "get" | "list" | "disable">;
        readonly domains: Pick<DomainRegistry, "claim" | "verify" | "list" | "disable">;
    };
}
