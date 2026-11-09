import { randomUUID } from "node:crypto";
import { HostingError } from "./errors";
import { hostingOrigin } from "./origin";
import type { HostingInstallationStore } from "hosting/interfaces/stores";

/** Called only for a known fresh installation, never to repair missing persisted state. */
export async function reserveHostingInstallation(store: HostingInstallationStore, publicOrigin: string) {
    const { origin } = hostingOrigin(publicOrigin);
    const installation = await store.reserveInstallation({
        format: "ulvia-hosting/v1",
        id: "installation",
        phase: "reserved",
        controlKey: `control:${randomUUID()}`,
        controlInstanceId: null,
        controlOrigin: origin,
        revision: 1,
    });
    if (installation.controlOrigin !== origin) {
        throw new HostingError("CONFLICT", "The initial Control origin cannot be changed by restarting services");
    }
    return installation;
}
