export const entryMocks = [
    { id: "pending", input: {}, outcome: { kind: "success", output: { pending: true } } },
    { id: "completed", input: {}, outcome: { kind: "success", output: { pending: false } } },
] as const;
