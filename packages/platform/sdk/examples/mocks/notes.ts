export const noteMocks = [
    {
        id: "existing",
        input: { id: "welcome" },
        outcome: { kind: "success", output: { id: "welcome", text: "Hello" } },
    },
    {
        id: "missing",
        input: { id: "missing" },
        outcome: { kind: "error", code: "NOT_FOUND", output: { message: "Note not found" } },
    },
] as const;
