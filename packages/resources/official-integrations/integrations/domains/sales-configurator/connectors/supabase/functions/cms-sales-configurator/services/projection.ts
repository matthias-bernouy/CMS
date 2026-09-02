import { isRecord } from "../core/records.ts";
import type { JsonRecord } from "../core/types.ts";

export function stripOkState(value: unknown): unknown {
    if (!isRecord(value) || value.state !== "ok") {
        return value;
    }
    const { state: _, ...result } = value;
    return result;
}

export function partnerProposalProjection(value: unknown): JsonRecord | null {
    if (!isRecord(value) || value.state !== "ok") {
        return null;
    }
    const stripped = stripOkState(value);
    if (!isRecord(stripped) || !isRecord(stripped.proposal)) {
        return null;
    }
    const proposal = stripped.proposal;
    const draft = isRecord(proposal.draftVersion) ? proposal.draftVersion : null;
    return {
        ...stripped,
        proposal: {
            ...proposal,
            events: redactPartnerEventActors(proposal.events),
            missingRequirements: proposal.missingRequirements ?? draft?.missingRequirements ?? [],
        },
    };
}

function redactPartnerEventActors(value: unknown): unknown {
    if (!Array.isArray(value)) {
        return value;
    }
    return value.map((entry) => {
        if (!isRecord(entry)) {
            return entry;
        }
        const { actorId: _, actor_id: __, ...event } = entry;
        return event;
    });
}

export function publicProposalProjection(value: unknown): JsonRecord | null {
    if (!isRecord(value) || value.state !== "ok" || !isRecord(value.proposal)) {
        return null;
    }
    const proposal = value.proposal;
    const version = isRecord(proposal.version) ? proposal.version : proposal;
    const salesContact = publicSalesContact(version.salesContact);
    const items = publicItems(version.items);
    if (
        typeof proposal.reference !== "string" ||
        typeof proposal.status !== "string" ||
        typeof version.publishedAt !== "string" ||
        typeof version.currency !== "string" ||
        typeof version.fixedTotalCents !== "number" ||
        typeof version.quoteItemCount !== "number" ||
        !salesContact ||
        !items
    ) {
        return null;
    }
    return {
        proposal: {
            reference: proposal.reference,
            status: proposal.status,
            title: proposal.title,
            introduction: proposal.introduction,
            publishedAt: version.publishedAt,
            currency: version.currency,
            fixedTotalCents: version.fixedTotalCents,
            quoteItemCount: version.quoteItemCount,
            salesContact,
            items,
        },
    };
}

function publicSalesContact(value: unknown): JsonRecord | null {
    if (!isRecord(value) || typeof value.displayName !== "string") {
        return null;
    }
    return {
        displayName: value.displayName,
        email: value.email ?? value.contactEmail,
    };
}

function publicItems(value: unknown, parentSortOrder: unknown = null): JsonRecord[] | null {
    if (!Array.isArray(value)) {
        return null;
    }
    const result: JsonRecord[] = [];
    for (const item of value) {
        const projected = publicItem(item, parentSortOrder);
        if (!projected) {
            return null;
        }
        result.push(projected);
        if (isRecord(item) && item.children !== undefined) {
            const children = publicItems(item.children, item.sortOrder);
            if (!children) {
                return null;
            }
            result.push(...children);
        }
    }
    return result;
}

function publicItem(value: unknown, parentSortOrder: unknown): JsonRecord | null {
    if (
        !isRecord(value) ||
        typeof value.kind !== "string" ||
        typeof value.origin !== "string" ||
        typeof value.label !== "string" ||
        typeof value.quantity !== "number" ||
        typeof value.pricingMode !== "string" ||
        typeof value.currency !== "string" ||
        typeof value.sortOrder !== "number"
    ) {
        return null;
    }
    return {
        parentSortOrder: value.parentSortOrder ?? parentSortOrder,
        depth:
            typeof value.depth === "number" ? value.depth : (value.parentSortOrder ?? parentSortOrder) === null ? 0 : 1,
        kind: value.kind,
        origin: value.origin,
        code: value.code,
        label: value.label,
        description: value.description,
        quantity: value.quantity,
        pricingMode: value.pricingMode,
        unitAmountCents: value.unitAmountCents,
        currency: value.currency,
        sortOrder: value.sortOrder,
    };
}
