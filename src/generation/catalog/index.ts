import type { ModelEntry } from "./types";

const IMAGE: ModelEntry = {
  id: "z-image-free",
  surface: "image",
  label: "Z-Image Turbo · Free",
  roles: { reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], default: "1:1" },
    resolution: { type: "enum", values: ["1k"], default: "1k" },
  },
};

const VIDEO: ModelEntry = {
  id: "ltx-video-free",
  surface: "video",
  label: "LTX Video · Free",
  roles: { start: 1, reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
    resolution: { type: "enum", values: ["512p"], default: "512p" },
    duration: { type: "range", min: 4, max: 4, default: 4, step: 1 },
  },
};

export const MODELS: readonly ModelEntry[] = [IMAGE, VIDEO];
export function getModel(id: string) {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}
export type { GenerationPlane, MediaItem, MediaRole, ModelEntry, PlatformPaths, Surface } from "./types";
export { parseSettings } from "./parse-settings";
