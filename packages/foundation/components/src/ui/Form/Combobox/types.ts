export type ComboOption = { value: string; label: string; disabled: boolean };
export type ComboItem = ComboOption & { kind: "option" | "create" };
