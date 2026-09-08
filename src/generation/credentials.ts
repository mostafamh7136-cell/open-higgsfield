export const PLATFORM_KEY_COOKIE = "free_open_models";

export class MissingCredentialsError extends Error {
  constructor() {
    super("Free open-model backend is not configured.");
    this.name = "MissingCredentialsError";
  }
}

export function encodeCredentials(_apiKey: string): string { return ""; }
export function decodeCredentials(_raw: string | undefined): { apiKey: string } | null { return null; }
export function parseCredentialInput(_data: unknown): { apiKey: string } { return { apiKey: "" }; }
export function toAuthorizationHeader(_apiKey: string): string { return ""; }
