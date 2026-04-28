import * as assert from "assert";
import {
  type FetchLike,
  testProviderConnectivity
} from "../../openAiCompatibleProvider";
import {
  ProviderSecretStorageAdapter,
  type ProviderSettingsLike,
  redactSecrets,
  readProviderConfiguration,
  resolveModelForTask,
  saveProviderConfiguration,
  updateModelRouting
} from "../../providerConfiguration";

suite("Provider configuration and secret storage", () => {
  test("saves provider settings without touching API key", async () => {
    const updates: Record<string, unknown> = {};
    const settings: ProviderSettingsLike = {
      async update(section: string, value: unknown): Promise<void> {
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

  test("uses assigned planning model when routing exists", () => {
    const settings: ProviderSettingsLike = {
      async update(): Promise<void> {},
      get<T>(section: string): T | undefined {
        if (section === "defaultModel") {
          return "gpt-4o-mini" as T;
        }

        if (section === "modelRouting") {
          return {
            planning: "gpt-4.1"
          } as T;
        }

        return undefined;
      }
    };

    assert.strictEqual(resolveModelForTask(settings, "planning"), "gpt-4.1");
  });

  test("falls back to default model when assignment is missing", () => {
    const settings: ProviderSettingsLike = {
      async update(): Promise<void> {},
      get<T>(section: string): T | undefined {
        if (section === "defaultModel") {
          return "gpt-4o-mini" as T;
        }

        if (section === "modelRouting") {
          return {
            planning: "gpt-4.1"
          } as T;
        }

        return undefined;
      }
    };

    assert.strictEqual(resolveModelForTask(settings, "coding"), "gpt-4o-mini");
  });

  test("updates model routing without losing provider config", async () => {
    const values: Record<string, unknown> = {
      baseUrl: "https://api.example.com/v1",
      displayName: "Example Provider",
      defaultModel: "gpt-4o-mini",
      modelRouting: {
        planning: "gpt-4.1"
      }
    };
    const settings: ProviderSettingsLike = {
      async update(section: string, value: unknown): Promise<void> {
        values[section] = value;
      },
      get<T>(section: string): T | undefined {
        return values[section] as T | undefined;
      }
    };

    const updatedRouting = await updateModelRouting(settings, {
      review: "gpt-4.1-mini"
    });

    assert.deepStrictEqual(updatedRouting, {
      planning: "gpt-4.1",
      review: "gpt-4.1-mini"
    });
    assert.deepStrictEqual(values.modelRouting, {
      planning: "gpt-4.1",
      review: "gpt-4.1-mini"
    });

    const snapshot = readProviderConfiguration(settings);
    assert.deepStrictEqual(snapshot, {
      baseUrl: "https://api.example.com/v1",
      displayName: "Example Provider",
      defaultModel: "gpt-4o-mini",
      modelRouting: {
        planning: "gpt-4.1",
        review: "gpt-4.1-mini"
      }
    });
  });

  test("returns provider ready on a valid 200 response", async () => {
    const fetchStub: FetchLike = async (_url, _init) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async json(): Promise<unknown> {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: "pong"
              }
            }
          ]
        };
      },
      async text(): Promise<string> {
        return "";
      }
    });

    const result = await testProviderConnectivity(
      {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-live-test",
        model: "gpt-4o-mini"
      },
      fetchStub
    );

    assert.strictEqual(result.ready, true);
    assert.strictEqual(result.message, "Provider ready.");
  });

  test("posts a minimal chat/completions request to configurable base URL", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchStub: FetchLike = async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json(): Promise<unknown> {
          return { choices: [{ message: { role: "assistant", content: "ok" } }] };
        },
        async text(): Promise<string> {
          return "";
        }
      };
    };

    await testProviderConnectivity(
      {
        baseUrl: "https://bothub.example/api/openai/v1/",
        apiKey: "sk-test",
        model: "meta-llama/llama-3.1-8b-instruct"
      },
      fetchStub
    );

    assert.strictEqual(
      capturedUrl,
      "https://bothub.example/api/openai/v1/chat/completions"
    );
    assert.deepStrictEqual(JSON.parse(capturedBody), {
      model: "meta-llama/llama-3.1-8b-instruct",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0
    });
  });

  test("returns actionable unauthorized error without exposing api key", async () => {
    const apiKey = "sk-secret-401";
    const fetchStub: FetchLike = async (_url, _init) => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      async json(): Promise<unknown> {
        return { error: { message: `invalid token ${apiKey}` } };
      },
      async text(): Promise<string> {
        return `invalid token ${apiKey}`;
      }
    });

    const result = await testProviderConnectivity(
      {
        baseUrl: "https://api.example.com/v1",
        apiKey,
        model: "gpt-4o-mini"
      },
      fetchStub
    );

    assert.strictEqual(result.ready, false);
    assert.ok(result.message.includes("401 Unauthorized"));
    assert.ok(result.message.includes("[REDACTED]"));
    assert.ok(!result.message.includes(apiKey));
  });

  test("returns actionable network error without exposing api key", async () => {
    const apiKey = "sk-network-secret";
    const fetchStub: FetchLike = async (_url, _init) => {
      throw new Error(`connection reset for key ${apiKey}`);
    };

    const result = await testProviderConnectivity(
      {
        baseUrl: "https://api.example.com/v1",
        apiKey,
        model: "gpt-4o-mini"
      },
      fetchStub
    );

    assert.strictEqual(result.ready, false);
    assert.ok(result.message.includes("Network error"));
    assert.ok(result.message.includes("[REDACTED]"));
    assert.ok(!result.message.includes(apiKey));
  });
});
