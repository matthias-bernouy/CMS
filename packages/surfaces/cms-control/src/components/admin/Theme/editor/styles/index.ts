import editor from "./editor.css" with { type: "text" };
import integration from "./integration.css" with { type: "text" };
import tokens from "./tokens.css" with { type: "text" };

export default [tokens, editor, integration].join("\n") as unknown as string;
