import type { LocalServicesState } from "../state";
import type { UlviaPaths } from "../../../paths";
import { join } from "node:path";

export async function announceControl(paths: UlviaPaths, state: LocalServicesState, log: (message: string) => void) {
    const origin = state.installation.hosting.controlOrigin;
    const local = state.installation.tls.mode === "disabled";
    const deadline = Date.now() + (local ? 15_000 : 3000);
    do {
        if (await controlAccessible(state)) {
            log(`Control is accessible at ${origin}/.cms/setup`);
            const bootstrap = join(paths.services, "credentials", "control-administrator.json");
            if (await Bun.file(bootstrap).exists()) {
                log(`Initial administrator credentials: ${bootstrap} (private file; never printed).`);
            } else {
                log("Sign in with an existing Control administrator account.");
            }
            return;
        }
        if (!local) {
            break;
        }
        await Bun.sleep(250);
    } while (Date.now() < deadline);
    if (local) {
        throw new Error(
            `Shared services started but Control is not accessible at ${origin}. Inspect ulvia services logs.`,
        );
    }
    log(
        `Control is provisioned at ${origin}; DNS/TLS or proxy readiness is pending. Inspect ulvia services status and logs.`,
    );
    if (!state.installation.hosting.publicAddresses.length) {
        log(
            "Set the installation public addresses with ulvia configure hosting --public-addresses <ip,ip>, then restart services.",
        );
    }
}
async function controlAccessible(state: LocalServicesState): Promise<boolean> {
    const origin = new URL(state.installation.hosting.controlOrigin);
    const url =
        state.installation.tls.mode === "disabled"
            ? `http://127.0.0.1:${state.installation.ports.http}/.cms/setup`
            : `${origin.origin}/.cms/setup`;
    try {
        const response = await fetch(url, {
            headers: { host: origin.host },
            redirect: "manual",
            signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        return response.status >= 200 && response.status < 400;
    } catch {
        return false;
    }
}
