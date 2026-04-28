import * as assert from "assert";
import {
  ProviderSecretStorageAdapter,
  type ProviderSettingsLike,
  redactSecrets,
  saveProviderConfiguration
} from "../../providerConfiguration";

suite("Provider configuration and secret storage", () => {
  test("saves provider settings without touching API key", async () => {
    const updates: Record<string, string> = {};
    const settings: ProviderSettingsLike = {
      async update(section: string, value: string): Promise<void> {
        updates[section] = value;
      },
      get<T>(_section: string): T | undefined {
        return undefined;
      }
    };

    await saveProviderConfiguration(settings, {
      baseUrl: "https://api.example.com/v1",
      displayName: "Example",
      defaultModel: "example-model"
    });

    assert.deepStrictEqual(updates, {
      baseUrl: "https://api.example.com/v1",
      displayName: "Example",
      defaultModel: "example-model"
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(updates, "apiKey"));
  });

  test("stores API key only in SecretStorage", async () => {
    const stored: Record<string, string> = {};
    const adapter = new ProviderSecretStorageAdapter({
      async store(key, value): Promise<void> {
        stored[key] = value;
      },
      async get(key): Promise<string | undefined> {
        return stored[key];
      },
      async delete(key): Promise<void> {
        delete stored[key];
      }
    });

    await adapter.saveApiKey("secret-value");
    assert.strictEqual(
      await adapter.getApiKey(),
      "secret-value",
      "API key should be available from secret storage."
    );
  });

  test("redacts secret value in storage error", async () => {
    const adapter = new ProviderSecretStorageAdapter({
      async store(_key, value): Promise<void> {
        throw new Error(`unable to persist key ${value}`);
      },
      async get(_key): Promise<string | undefined> {
        return undefined;
      },
      async delete(_key): Promise<void> {}
    });

    const secret = "sk-test-123";
    await assert.rejects(
      () => adapter.saveApiKey(secret),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(
          !error.message.includes(secret),
          "Error must not contain the original secret."
        );
        assert.ok(
          error.message.includes("[REDACTED]"),
          "Error should indicate that redaction was applied."
        );
        return true;
      }
    );
  });

  test("redact helper replaces all secret occurrences", () => {
    const message = "token sk-abc leaked; sk-abc should not be visible";
    assert.strictEqual(
      redactSecrets(message, ["sk-abc"]),
      "token [REDACTED] leaked; [REDACTED] should not be visible"
    );
  });
});
