import { defineContract, defineOperation, implementContract, z } from "@bernouy/ulvia-sdk";
import { notesContract, readNote } from "../../examples/notes";

const { id: removedId, ...missingId } = readNote;
// @ts-expect-error Every operation declares its stable public identity.
defineOperation(missingId);
const { bindings: removedBindings, ...missingBindings } = readNote;
// @ts-expect-error Every operation declares its exposure list explicitly.
defineOperation(missingBindings);
// @ts-expect-error Access must be one of the admitted contract policies.
defineOperation({ ...readNote, access: "owner" });
// @ts-expect-error Unknown transport profiles cannot be silently emitted.
defineOperation({ ...readNote, bindings: [{ id: "ws", transport: "ws" }] });

const wrongMocks = [
    { id: "wrong", input: { id: 42 }, outcome: { kind: "success", output: { id: "one", text: "One" } } },
] as const;
// @ts-expect-error Imported mocks must not widen an operation's inferred input schema.
defineOperation({ ...readNote, mocks: wrongMocks });

const status = defineOperation({
    id: "notes.status",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [],
    input: z.strictObject({ flag: z.boolean() }),
    output: z.boolean(),
    errors: {},
});
const contract = defineContract({ ...notesContract, operations: [readNote, status] });
implementContract(contract, {
    "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "One" }),
    "notes.status": (_dependencies: {}) => (input) => {
        // @ts-expect-error The status handler receives its own schema, not the note schema.
        void input.id;
        return input.flag;
    },
});
const literalId: "notes.read" = contract.operations[0].id;
const literalMethod: "GET" = contract.operations[0].bindings[0].method;
void [removedId, removedBindings, literalId, literalMethod];
