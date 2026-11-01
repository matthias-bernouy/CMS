import { NodeLogOutput } from "./writer";

let shared: NodeLogOutput | undefined;

export function operatorOutput(): NodeLogOutput {
    shared ??= new NodeLogOutput(process.stdout, process.stderr);
    return shared;
}

/** Process-wide counters, including losses before the destination accepts an entry. */
export function nodeLogOutputStats() {
    return operatorOutput().stats();
}
