export type EditableState = {
    id: string;
    label: string;
    description?: string;
    group?: string;
    isActive(): boolean;
    enter(): EditableStateSession;
};

export type EditableStateSession = {
    exit(): void;
};
