// 诗歌树 agent 统一出口（解耦：外部只 import 这里）。
export * from './types';
export { ATTR_DEFS, sensePoemAttributes, type AttrDef } from './attributes';
export { attributesToSketch, makeRng, poemSeed, type SketchParams } from './sketch';
export { POEM_TREE_SEEDS } from './catalog';
export { runPoemTreeAgent } from './agent';
export { plantToEarth, alreadyPlanted, unplant } from './pin';
