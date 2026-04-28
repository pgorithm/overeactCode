import { sanitizeErrorMessage } from "./providerConfiguration";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface FetchRequestInitLike {
  method: string;
  headers: Record<string, string>;
  body: string;
}

export type FetchLike = (
  url: string,
  init: FetchRequestInitLike
) => Promise<FetchResponseLike>;

export interface ProviderConnectivityInput {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderConnectivityResult {
  ready: boolean;
  message: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function getDefaultFetch(): FetchLike {
  const maybeFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof maybeFetch !== "function") {
    throw new Error("Fetch API is not available in the current runtime.");
  }

  return maybeFetch;
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isValidChatCompletionsResponse(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const choices = (payload as { choices?: unknown }).choices;
  return Array.isArray(choices) && choices.length > 0;
}

export async function testProviderConnectivity(
  input: ProviderConnectivityInput,
  fetchImpl: FetchLike = getDefaultFetch()
): Promise<ProviderConnectivityResult> {
  const endpoint = buildCompletionsUrl(input.baseUrl);
  const requestBody = {
    model: input.model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    temperature: 0
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const rawPayload = await response
        .json()
        .catch(async () => ({ message: await response.text() }));
      const details = sanitizeErrorMessage(
        extractErrorMessage(rawPayload),
        [input.apiKey]
      );
      const suffix = details.length > 0 ? `: ${details}` : "";
      return {
        ready: false,
        message: `Provider request failed (${response.status} ${response.statusText})${suffix}`
      };
    }

    const payload = await response.json();
    if (!isValidChatCompletionsResponse(payload)) {
      return {
        ready: false,
        message:
          "Provider responded, but payload is not chat/completions-compatible."
      };
    }

    return {
      ready: true,
      message: "Provider ready."
    };
  } catch (error) {
    return {
      ready: false,
      message: `Network error while checking provider: ${sanitizeErrorMessage(error, [
        input.apiKey
      ])}`
    };
  }
}
