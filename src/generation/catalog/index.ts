import type { ModelEntry } from "./types";

const Z_IMAGE: ModelEntry = {
  id: "z-image-free",
  surface: "image",
  label: "Z-Image Turbo · Free",
  roles: { reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], default: "1:1" },
    resolution: { type: "enum", values: ["fast"], default: "fast" },
  },
};

const FLUX_SCHNELL: ModelEntry = {
  id: "flux-schnell-free",
  surface: "image",
  label: "FLUX.1 Schnell · Free",
  roles: { reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], default: "1:1" },
    resolution: { type: "enum", values: ["fast"], default: "fast" },
  },
};

const WAN_5B: ModelEntry = {
  id: "wan-2-2-5b-free",
  surface: "video",
  label: "Wan 2.2 5B · Free",
  roles: { start: 1, reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["fast"], default: "fast" },
    duration: { type: "range", min: 1, max: 5, default: 2, step: 1 },
  },
};

const WAN_14B: ModelEntry = {
  id: "wan-2-2-14b-i2v-free",
  surface: "video",
  label: "Wan 2.2 14B Fast · Free",
  roles: { start: 1, reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["fast"], default: "fast" },
    duration: { type: "range", min: 1, max: 5, default: 2, step: 1 },
  },
};

const LTX: ModelEntry = {
  id: "ltx-video-free",
  surface: "video",
  label: "LTX Video · Free",
  roles: { start: 1, reference: 8 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["fast"], default: "fast" },
    duration: { type: "range", min: 0.3, max: 8.5, default: 2, step: 0.5 },
  },
};

export const MODELS: readonly ModelEntry[] = [Z_IMAGE, FLUX_SCHNELL, WAN_5B, WAN_14B, LTX];
export function getModel(id: string) {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}
export type { GenerationPlane, MediaItem, MediaRole, ModelEntry, PlatformPaths, Surface } from "./types";
export { parseSettings } from "./parse-settings";
