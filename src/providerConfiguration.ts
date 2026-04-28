const SECRET_KEY = "overeactCode.provider.apiKey";

export interface SecretStorageLike {
  store(key: string, value: string): Thenable<void>;
  get(key: string): Thenable<string | undefined>;
  delete(key: string): Thenable<void>;
}

export interface ProviderSettingsLike {
  update(section: string, value: unknown): Thenable<void>;
  get<T>(section: string): T | undefined;
}

export interface ProviderConfigInput {
  baseUrl: string;
  displayName: string;
  defaultModel: string;
}

export const MODEL_TASK_TYPES = [
  "planning",
  "coding",
  "review",
  "summarization",
  "tool_decision"
] as const;

export type ModelTaskType = (typeof MODEL_TASK_TYPES)[number];

export interface ModelAssignment {
  taskType: ModelTaskType;
  model: string;
}

export type ModelRoutingInput = Partial<Record<ModelTaskType, string>>;

export interface ProviderConfigurationSnapshot {
  baseUrl: string;
  displayName: string;
  defaultModel: string;
  modelRouting: ModelRoutingInput;
}

function isModelTaskType(value: string): value is ModelTaskType {
  return (MODEL_TASK_TYPES as readonly string[]).includes(value);
}

function normalizeModelRouting(value: unknown): ModelRoutingInput {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const normalized: ModelRoutingInput = {};
  for (const [taskType, model] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!isModelTaskType(taskType) || typeof model !== "string") {
      continue;
    }

    const modelName = model.trim();
    if (modelName.length > 0) {
      normalized[taskType] = modelName;
    }
  }

  return normalized;
}

export function redactSecrets(value: string, secrets: ReadonlyArray<string>): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.trim().length === 0) {
      continue;
    }

    redacted = redacted.split(secret).join("[REDACTED]");
  }

  return redacted;
}

export function sanitizeErrorMessage(
  error: unknown,
  secrets: ReadonlyArray<string>
): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return redactSecrets(rawMessage, secrets);
}

export class ProviderSecretStorageAdapter {
  public constructor(private readonly secrets: SecretStorageLike) {}

  public async saveApiKey(apiKey: string): Promise<void> {
    try {
      await this.secrets.store(SECRET_KEY, apiKey);
    } catch (error) {
      throw new Error(
        `Failed to store provider API key: ${sanitizeErrorMessage(error, [apiKey])}`
      );
    }
  }

  public getApiKey(): Thenable<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  public clearApiKey(): Thenable<void> {
    return this.secrets.delete(SECRET_KEY);
  }
}

export async function saveProviderConfiguration(
  settings: ProviderSettingsLike,
  input: ProviderConfigInput
): Promise<void> {
  await settings.update("baseUrl", input.baseUrl);
  await settings.update("displayName", input.displayName);
  await settings.update("defaultModel", input.defaultModel);
}

export function getModelRouting(settings: ProviderSettingsLike): ModelRoutingInput {
  return normalizeModelRouting(settings.get<unknown>("modelRouting"));
}

export function resolveModelForTask(
  settings: ProviderSettingsLike,
  taskType: ModelTaskType
): string {
  const modelRouting = getModelRouting(settings);
  const assignedModel = modelRouting[taskType];
  if (typeof assignedModel === "string" && assignedModel.length > 0) {
    return assignedModel;
  }

  return settings.get<string>("defaultModel") ?? "";
}

export async function updateModelRouting(
  settings: ProviderSettingsLike,
  updates: Partial<Record<ModelTaskType, string | undefined>>
): Promise<ModelRoutingInput> {
  const nextRouting = {
    ...getModelRouting(settings)
  };

  for (const taskType of MODEL_TASK_TYPES) {
    if (!Object.prototype.hasOwnProperty.call(updates, taskType)) {
      continue;
    }

    const model = updates[taskType]?.trim();
    if (typeof model === "string" && model.length > 0) {
      nextRouting[taskType] = model;
      continue;
    }

    delete nextRouting[taskType];
  }

  await settings.update("modelRouting", nextRouting);
  return nextRouting;
}

export function readProviderConfiguration(
  settings: ProviderSettingsLike
): ProviderConfigurationSnapshot {
  return {
    baseUrl: settings.get<string>("baseUrl") ?? "",
    displayName: settings.get<string>("displayName") ?? "",
    defaultModel: settings.get<string>("defaultModel") ?? "",
    modelRouting: getModelRouting(settings)
  };
}
