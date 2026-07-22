import controls from "./controls.css" with { type: "text" };
import feedback from "./feedback.css" with { type: "text" };
import layout from "./layout.css" with { type: "text" };
import mapping from "./mapping.css" with { type: "text" };

export default [layout, mapping, controls, feedback].join("\n") as unknown as string;
