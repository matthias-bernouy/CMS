import {
    shadowDomDepth, webVitals, networkDuplicates, blocRealInsert,
    realisticLanding, insertLargeTemplate, deepNesting,
} from "./rendering";
import { pageSaveRoundtrip, templateSaveRoundtrip } from "./persistence";
import {
    typeAndEnter, holdEnter30, holdEnterReal, holdEnterInAllowMultiple,
    enterNextToImageSync,
} from "./typing";
import {
    slashOpenLibrary, hoverRealMouse, bagDuplicate, selectTextToolbar, dragReorder,
} from "./interaction";
import {
    listenerScan, listenerGrowth, modeSwitchCost, deleteCleanup, editorLifecycleLeak,
} from "./memory";
import {
    bulkInsert200, bulkInsert1000, observerScaling, singlePInsert,
    hoverCostScenario, typingCostScenario, serializeCostScenario,
    largeGridBuild20x20, memoryFootprintScenario,
} from "./internals";
import type { Scenario } from "./types";

export type { Scenario, BrowserScenario, DriverScenario } from "./types";

export const SCENARIOS: Scenario[] = [
    // Structural — run first so later scenarios' insertions don't pollute the count.
    listenerScan,
    listenerGrowth,
    editorLifecycleLeak,
    blocRealInsert,
    realisticLanding,
    insertLargeTemplate,
    // Internals — cheap, always-on signals.
    bulkInsert200,
    bulkInsert1000,
    observerScaling,
    singlePInsert,
    hoverCostScenario,
    typingCostScenario,
    serializeCostScenario,
    largeGridBuild20x20,
    memoryFootprintScenario,
    modeSwitchCost,
    deleteCleanup,
    deepNesting,
    shadowDomDepth,
    webVitals,
    networkDuplicates,
    // Network roundtrips.
    pageSaveRoundtrip,
    templateSaveRoundtrip,
    // Human-like — exercise the real editor pipeline.
    typeAndEnter,
    slashOpenLibrary,
    hoverRealMouse,
    bagDuplicate,
    selectTextToolbar,
    dragReorder,
    holdEnter30,
    holdEnterReal,
    holdEnterInAllowMultiple,
    enterNextToImageSync,
];
