import { createLocalUser } from "@bernouy/auth/management";
import type { ProviderInstanceAdministrator, ProviderInstanceTransitionExecution } from "@bernouy/ulvia-provider";
import type { InstanceComposition } from "./composition/ProviderInstanceHost";

export async function initializeOfficialAdministrator(
    composition: InstanceComposition,
    administrator: ProviderInstanceAdministrator,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const stores = composition.stores;
    const existing = await stores.credentials.getByEmail(administrator.email);
    execution.throwIfLeaseLost();
    const subjectId = existing
        ? `local:${existing.sub}`
        : (
              await createLocalUser(
                  { credentials: stores.credentials, users: stores.users },
                  { ...administrator, emailVerified: true },
              )
          ).sub;
    execution.throwIfLeaseLost();
    await composition.administrators.set(subjectId, true);
    execution.throwIfLeaseLost();
}
