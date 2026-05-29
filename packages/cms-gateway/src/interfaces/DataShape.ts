/**
 * DataShape — description minimale de la FORME d'une donnée (entrée/sortie d'un
 * endpoint, voir `Gateway.ts`). Volontairement réduit : juste le type + la structure.
 *
 * Les champs reprennent le vocabulaire JSON Schema (`type`/`properties`/`items`),
 * donc c'est familier ET assignable tel quel à l'éditeur (`flattenScalars`,
 * `JsonEditor`). On ajoutera `required`/`enum`/`format`/`description` quand la
 * validation ou l'éditeur en auront besoin.
 */
export type DataShape = {
    type: "string" | "number" | "boolean" | "object" | "array";
    properties?: Record<string, DataShape>;   // quand type === "object"
    items?: DataShape;                          // quand type === "array"
};
