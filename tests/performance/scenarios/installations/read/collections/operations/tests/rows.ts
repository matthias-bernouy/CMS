import type { KnownOperation } from "../oracle";

export const operationRows: readonly KnownOperation[] = [1, 2, 3].map((index) => ({
    operationId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    capabilityId: "apply-collection-upgrade",
    status: "succeeded",
    revision: 3,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:01.000Z",
}));
