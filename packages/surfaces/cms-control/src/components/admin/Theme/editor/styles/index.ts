import category from "./category.css" with { type: "text" };
import editor from "./editor.css" with { type: "text" };
import explorer from "./explorer.css" with { type: "text" };
import integration from "./integration.css" with { type: "text" };
import reference from "./reference.css" with { type: "text" };
import tokens from "./tokens.css" with { type: "text" };

export default [editor, category, explorer, tokens, integration, reference].join("\n") as unknown as string;
