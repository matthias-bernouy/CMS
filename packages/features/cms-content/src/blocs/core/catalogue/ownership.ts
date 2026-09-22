import type { BlocOwnership, BlocRecord, TBloc, TBlocWrite } from "cms-content/blocs/interfaces/blocs";
import { BlocOwnershipConflictError } from "cms-content/application/core/validation/errors";

export const CODE_MANAGED_BLOC_OWNERSHIP: BlocOwnership = { kind: "code-managed" };

export function isBlocOwnership(value: unknown): value is BlocOwnership {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const ownership = value as Record<string, unknown>;
    if (ownership.kind === "code-managed") {
        return true;
    }
    if (ownership.kind === "site-builder") {
        return typeof ownership.definitionId === "string" && !!ownership.definitionId.trim();
    }
    return false;
}

export function normalizeBlocWrite(bloc: TBlocWrite): TBloc {
    return structuredClone({
        ...bloc,
        ownership: bloc.ownership ?? CODE_MANAGED_BLOC_OWNERSHIP,
    });
}

export function sameBlocOwner(left: BlocOwnership, right: BlocOwnership): boolean {
    if (left.kind !== right.kind) {
        return false;
    }
    if (left.kind === "site-builder" && right.kind === "site-builder") {
        return left.definitionId === right.definitionId;
    }
    return left.kind === "code-managed" && right.kind === "code-managed";
}

export function assertBlocOwner(tag: string, current: BlocOwnership, incoming: BlocOwnership): void {
    if (!sameBlocOwner(current, incoming)) {
        throw new BlocOwnershipConflictError(tag);
    }
}

export function assertBlocRecordOwner(record: BlocRecord, incoming: BlocOwnership): void {
    assertBlocOwner(record.tag, record.ownership, incoming);
}
