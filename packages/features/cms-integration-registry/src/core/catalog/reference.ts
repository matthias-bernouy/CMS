import type { IntegrationRegistryCatalogSnapshot } from "../../interfaces/catalog";
import { assertBuiltIntegrationRegistryCatalogSnapshot } from "./snapshot";

export class IntegrationRegistryCatalogSnapshotReference {
    private currentSnapshot: IntegrationRegistryCatalogSnapshot;

    constructor(initialSnapshot: IntegrationRegistryCatalogSnapshot) {
        assertBuiltIntegrationRegistryCatalogSnapshot(initialSnapshot);
        this.currentSnapshot = initialSnapshot;
    }

    current(): IntegrationRegistryCatalogSnapshot {
        return this.currentSnapshot;
    }

    swap(nextSnapshot: IntegrationRegistryCatalogSnapshot): IntegrationRegistryCatalogSnapshot {
        assertBuiltIntegrationRegistryCatalogSnapshot(nextSnapshot);
        const previousSnapshot = this.currentSnapshot;
        this.currentSnapshot = nextSnapshot;
        return previousSnapshot;
    }

    compareAndSwap(
        expectedSnapshot: IntegrationRegistryCatalogSnapshot,
        nextSnapshot: IntegrationRegistryCatalogSnapshot,
    ): boolean {
        assertBuiltIntegrationRegistryCatalogSnapshot(nextSnapshot);
        if (this.currentSnapshot !== expectedSnapshot) {
            return false;
        }
        this.currentSnapshot = nextSnapshot;
        return true;
    }
}
