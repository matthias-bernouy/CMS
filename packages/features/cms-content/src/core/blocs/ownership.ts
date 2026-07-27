import type { BlocOwnership, BlocRecord, TBloc, TBlocWrite } from "cms-content/interfaces/blocs";
import { BlocOwnershipConflictError } from "cms-content/core/validation/errors";

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
    return (
        ownership.kind === "integration" &&
        typeof ownership.integrationKind === "string" &&
        !!ownership.integrationKind.trim() &&
        typeof ownership.installationId === "string" &&
        !!ownership.installationId.trim() &&
        typeof ownership.definitionVersion === "string" &&
        !!ownership.definitionVersion.trim()
    );
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
    if (left.kind === "integration" && right.kind === "integration") {
        return left.integrationKind === right.integrationKind && left.installationId === right.installationId;
    }
    return left.kind === "code-managed" && right.kind === "code-managed";
}

export function assertBlocOwner(tag: string, current: BlocOwnership, incoming: BlocOwnership): void {
    if (!sameBlocOwner(current, incoming)) {
        throw new BlocOwnershipConflictError(tag);
    }
}

export function assertBlocRecordOwner(record: BlocRecord, incoming: BlocOwnership): void {
    if (sameBlocOwner(record.ownership, incoming)) {
        return;
    }
    if (
        record.legacyOwnershipClaim === "unclaimed" &&
        record.ownership.kind === "code-managed" &&
        incoming.kind === "integration"
    ) {
        return;
    }
    throw new BlocOwnershipConflictError(record.tag);
}
