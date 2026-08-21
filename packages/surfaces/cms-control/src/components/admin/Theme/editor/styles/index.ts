import editor from "./editor.css" with { type: "text" };
import explorer from "./explorer.css" with { type: "text" };
import tokens from "./tokens.css" with { type: "text" };

export default [editor, explorer, tokens].join("\n") as unknown as string;
