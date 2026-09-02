const createdAt = "2026-07-20T08:00:00Z";
const updatedAt = "2026-07-22T09:00:00Z";
const laterUpdatedAt = "2026-07-22T10:00:00Z";

const createdCondition = {
    row: {
        code: "refurbished",
        label: "Refurbished",
        description: null,
        position: 8,
        enabled: true,
        created_at: createdAt,
        updated_at: updatedAt,
    },
    dto: {
        code: "refurbished",
        label: "Refurbished",
        description: null,
        position: 8,
        enabled: true,
        createdAt,
        updatedAt,
    },
};

const updatedCondition = {
    row: {
        ...createdCondition.row,
        label: "Professionally refurbished",
        description: "Inspected and restored",
        position: 9,
        enabled: false,
        updated_at: laterUpdatedAt,
    },
    dto: {
        ...createdCondition.dto,
        label: "Professionally refurbished",
        description: "Inspected and restored",
        position: 9,
        enabled: false,
        updatedAt: laterUpdatedAt,
    },
};

const createdState = {
    row: {
        code: "quality_review",
        label: "Quality review",
        phase: "admin_review",
        position: 12,
        enabled: true,
        terminal: false,
        created_at: createdAt,
        updated_at: updatedAt,
    },
    dto: {
        code: "quality_review",
        label: "Quality review",
        phase: "admin_review",
        position: 12,
        enabled: true,
        terminal: false,
        createdAt,
        updatedAt,
    },
};

const updatedState = {
    row: {
        ...createdState.row,
        label: "Review closed",
        phase: "terminal",
        position: 14,
        enabled: false,
        terminal: true,
        updated_at: laterUpdatedAt,
    },
    dto: {
        ...createdState.dto,
        label: "Review closed",
        phase: "terminal",
        position: 14,
        enabled: false,
        terminal: true,
        updatedAt: laterUpdatedAt,
    },
};

const createdTransition = {
    row: {
        from_state: "quality_review",
        action: "complete_review",
        actor_kind: "admin",
        to_state: "approved",
        created_at: createdAt,
    },
    dto: {
        fromState: "quality_review",
        action: "complete_review",
        actorKind: "admin",
        toState: "approved",
        createdAt,
    },
};

const updatedTransition = {
    row: { ...createdTransition.row, to_state: "rejected" },
    dto: { ...createdTransition.dto, toState: "rejected" },
};

const createdCustomField = {
    row: {
        entity_type: "product",
        key: "weight",
        label: "Weight",
        field_type: "number",
        options: [],
        unit: null,
        required: false,
        self_editable: false,
        admin_editable: true,
        public_readable: false,
        show_in_dashboard_table: false,
        position: 3,
        enabled: true,
        created_at: createdAt,
        updated_at: updatedAt,
    },
    dto: {
        entityType: "product",
        key: "weight",
        label: "Weight",
        fieldType: "number",
        options: [],
        unit: null,
        required: false,
        selfEditable: false,
        adminEditable: true,
        publicReadable: false,
        showInDashboardTable: false,
        position: 3,
        enabled: true,
        createdAt,
        updatedAt,
    },
};

const updatedCustomField = {
    row: {
        ...createdCustomField.row,
        label: "Weight (kg)",
        unit: "kg",
        required: true,
        public_readable: true,
        show_in_dashboard_table: true,
        position: 4,
        updated_at: laterUpdatedAt,
    },
    dto: {
        ...createdCustomField.dto,
        label: "Weight (kg)",
        unit: "kg",
        required: true,
        publicReadable: true,
        showInDashboardTable: true,
        position: 4,
        updatedAt: laterUpdatedAt,
    },
};

export const fixturePairs = {
    condition: [createdCondition, updatedCondition],
    state: [createdState, updatedState],
    transition: [createdTransition, updatedTransition],
    customField: [createdCustomField, updatedCustomField],
} as const;
