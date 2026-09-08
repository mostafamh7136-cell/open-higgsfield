export type QueuedGeneration = {
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: unknown;
};

export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string }
  | { requestId: string; status?: string; images?: Array<{ url: string }>; video?: { url: string }; error?: unknown };

export class PlatformError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(typeof body === "string" ? body : `Generation request failed (${status})`);
    this.name = "PlatformError";
    this.status = status;
    this.body = body;
  }
}

export function isModelId(model: string) { return /^[a-z0-9._/-]+$/i.test(model) && !model.includes(".."); }
export function createPlatformClient() { throw new Error("The paid provider has been removed. Free Hugging Face open-model Spaces are used instead."); }
