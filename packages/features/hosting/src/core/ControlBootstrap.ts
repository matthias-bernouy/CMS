import { HostingError } from "./errors";
import { hostingOrigin } from "./origin";
import { reserveHostingInstallation } from "./installation";
import { ProviderInstanceTransitionBusyError } from "hosting/instances/core/errors";
import type { DomainRegistry } from "./domains/DomainRegistry";
import type { ProviderInstanceLifecycle, ProviderInstanceCredentials } from "hosting/instances/core/lifecycle";
import type { OfficialInstanceProvisioner, ProviderInstanceAdministrator } from "hosting/instances/core/provisioning";
import type { ProviderInstanceRegistry } from "hosting/instances/interfaces/registry";
import type { HostingInstallationStore, HostingDomainStore } from "hosting/interfaces/stores";
import type { HostingInstallation } from "hosting/interfaces/state";

/** Deployment-only bootstrap. It uses the ordinary provisioning path with the Control system plan. */
export class ControlBootstrap {
    constructor(
        private readonly installations: HostingInstallationStore,
        private readonly domains: HostingDomainStore,
        private readonly instances: Pick<ProviderInstanceRegistry, "get" | "getByIdempotencyKey">,
        private readonly lifecycle: ProviderInstanceLifecycle,
        private readonly credentials: Pick<ProviderInstanceCredentials, "ensure" | "read">,
        private readonly provisioner: Pick<OfficialInstanceProvisioner, "provision">,
        private readonly registry: Pick<DomainRegistry, "registerManaged">,
        private readonly pristine: () => Promise<boolean>,
    ) {}

    async initialize(publicOrigin: string, administrator?: ProviderInstanceAdministrator) {
        const { origin, hostname } = hostingOrigin(publicOrigin);
        let installation = await this.installations.readInstallation();
        const input = { label: "Control", cmsUrl: origin, ...(administrator ? { administrator } : {}) };
        if (!installation) {
            if (!(await this.pristine())) {
                installation = await this.installations.readInstallation();
                if (!installation) {
                    throw new HostingError("CONFLICT", "Hosting state is missing from a populated installation");
                }
            }
            if (!installation) {
                if (!administrator) {
                    throw new HostingError(
                        "INVALID_INPUT",
                        "Operator-supplied initial administrator credentials are required",
                    );
                }
                await this.lifecycle.prepare(
                    "control-input-validation",
                    { ...input, administrator },
                    { kind: "operator" },
                );
                installation = await reserveHostingInstallation(this.installations, origin);
            }
        }
        if (installation.controlOrigin !== origin) {
            throw new HostingError("CONFLICT", "The initial Control origin cannot change on restart");
        }
        let instance = installation.controlInstanceId
            ? await this.instances.get(installation.controlInstanceId)
            : await this.instances.getByIdempotencyKey(installation.controlKey);
        if (installation.phase === "ready") {
            if (
                !instance ||
                instance.idempotencyKey !== installation.controlKey ||
                instance.status === "disabled" ||
                !(await this.credentials.read(instance.id))
            ) {
                throw new HostingError(
                    "UNAVAILABLE",
                    "Persisted Control state is unavailable; operator recovery is required",
                );
            }
            const domain = await this.domains.getDomain(hostname);
            if (
                !domain ||
                domain.instanceId !== instance.id ||
                domain.origin !== origin ||
                domain.state === "pending" ||
                domain.state === "disabled"
            ) {
                throw new HostingError(
                    "UNAVAILABLE",
                    "Persisted Control domain is unavailable; operator recovery is required",
                );
            }
            if (instance.cmsUrl !== origin) {
                const primary = await this.domains.getDomain(hostingOrigin(instance.cmsUrl).hostname);
                if (
                    !primary ||
                    primary.instanceId !== instance.id ||
                    primary.origin !== instance.cmsUrl ||
                    (primary.state !== "active" && primary.state !== "verified")
                ) {
                    throw new HostingError("UNAVAILABLE", "The elected Control domain is unavailable");
                }
            }
            return { installation, instance, domain };
        }
        if (
            instance &&
            (instance.idempotencyKey !== installation.controlKey ||
                instance.cmsUrl !== origin ||
                instance.status === "disabled")
        ) {
            throw new HostingError("CONFLICT", "Reserved Control identity does not match its provisioning record");
        }
        if (!instance) {
            if (!administrator) {
                throw new HostingError(
                    "INVALID_INPUT",
                    "Control provisioning requires its original administrator credentials",
                );
            }
            const candidate = await this.lifecycle.prepare(
                installation.controlKey,
                { ...input, administrator },
                { kind: "operator" },
            );
            installation = await this.bind(installation, candidate.id);
            instance = (
                await this.lifecycle.create(installation.controlKey, { ...input, administrator }, { kind: "operator" })
            ).instance;
        } else {
            installation = await this.bind(installation, instance.id);
            await this.credentials.ensure(instance);
            try {
                instance = await this.provisioner.provision(instance.id);
            } catch (error) {
                if (!(error instanceof ProviderInstanceTransitionBusyError)) {
                    throw error;
                }
                instance = await this.instances.get(instance.id);
                if (!instance) {
                    throw new HostingError("UNAVAILABLE", "Control disappeared during provisioning");
                }
            }
        }
        const domain = await this.registry.registerManaged(instance.id, origin);
        if (instance.status === "ready") {
            try {
                installation = await this.installations.completeInstallation(installation.revision);
            } catch (error) {
                const current = await this.installations.readInstallation();
                if (!current || current.phase !== "ready" || current.controlInstanceId !== instance.id) {
                    throw error;
                }
                installation = current;
            }
        }
        return { installation, instance, domain };
    }

    private async bind(installation: HostingInstallation, instanceId: string) {
        if (installation.controlInstanceId) {
            if (installation.controlInstanceId !== instanceId) {
                throw new HostingError("CONFLICT", "Reserved Control identity changed");
            }
            return installation;
        }
        try {
            return await this.installations.bindControl(installation.revision, instanceId);
        } catch (error) {
            const current = await this.installations.readInstallation();
            if (!current || current.controlInstanceId !== instanceId) {
                throw error;
            }
            return current;
        }
    }
}
