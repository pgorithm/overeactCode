const SECRET_KEY = "overeactCode.provider.apiKey";

export interface SecretStorageLike {
  store(key: string, value: string): Thenable<void>;
  get(key: string): Thenable<string | undefined>;
  delete(key: string): Thenable<void>;
}

export interface ProviderSettingsLike {
  update(section: string, value: string): Thenable<void>;
  get<T>(section: string): T | undefined;
}

export interface ProviderConfigInput {
  baseUrl: string;
  displayName: string;
  defaultModel: string;
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
