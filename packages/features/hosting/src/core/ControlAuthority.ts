import { HostingError } from "./errors";
import type { HostingActor, HostingDomain } from "hosting/interfaces/state";
import type { HostingInstallationStore } from "hosting/interfaces/stores";

/** Local CMS administrator status is insufficient without persisted hosting scope. */
export class ControlAuthority {
    constructor(
        private readonly installations: HostingInstallationStore,
        private readonly administrator: (instanceId: string, subjectId: string) => Promise<boolean>,
    ) {}

    async assertAdministrator(actor: HostingActor): Promise<void> {
        const installation = await this.installations.readInstallation();
        if (
            !installation?.controlInstanceId ||
            installation.phase !== "ready" ||
            actor.instanceId !== installation.controlInstanceId ||
            !actor.subjectId ||
            !(await this.administrator(actor.instanceId, actor.subjectId))
        ) {
            throw new HostingError("FORBIDDEN", "Current Control administrator authority is required");
        }
        const current = await this.installations.readInstallation();
        if (!current || current.revision !== installation.revision) {
            throw new HostingError("FORBIDDEN", "Hosting authority changed during authorization");
        }
    }

    async assertDomainCanBeDisabled(actor: HostingActor, domain: HostingDomain): Promise<void> {
        await this.assertAdministrator(actor);
        const installation = await this.installations.readInstallation();
        if (
            !installation ||
            (domain.instanceId === installation.controlInstanceId && domain.origin === installation.controlOrigin)
        ) {
            throw new HostingError("FORBIDDEN", "The installation Control domain cannot be disabled");
        }
    }
}
