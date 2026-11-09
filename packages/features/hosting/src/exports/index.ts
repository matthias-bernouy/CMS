export { ControlAuthority } from "hosting/core/ControlAuthority";
export { ControlBootstrap } from "hosting/core/ControlBootstrap";
export { InstanceManagement } from "hosting/core/InstanceManagement";
export { DomainAdmissionPolicy } from "hosting/core/domains/AdmissionPolicy";
export type { CreateHostedInstance, HostedInstance } from "hosting/interfaces/management";
export { DomainRegistry } from "hosting/core/domains/DomainRegistry";
export { HostingError } from "hosting/core/errors";
export { reserveHostingInstallation } from "hosting/core/installation";
export { domainHostname, hostingOrigin } from "hosting/core/origin";
export type {
    HostingInstallation,
    HostingDomain,
    HostingActor,
    HostingDomainPage,
    DomainState,
    DomainTlsState,
} from "hosting/interfaces/state";
export type {
    HostingInstallationStore,
    HostingDomainStore,
    HostingInstanceReader,
    HostingInstanceState,
} from "hosting/interfaces/stores";
