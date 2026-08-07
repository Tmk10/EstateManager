import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from "promptfoo";
import { REVIEW_JSON_SCHEMA, SYSTEM_PROMPT } from "./review-schema.ts";

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterUsage {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

interface ReviewEvalProviderConfig {
  model?: unknown;
}

export default class ReviewEvalProvider implements ApiProvider {
  private model: string;

  constructor(options: ProviderOptions) {
    const config = options.config as ReviewEvalProviderConfig | undefined;
    this.model = typeof config?.model === "string" ? config.model : "anthropic/claude-sonnet-5";
  }

  id(): string {
    return `openrouter-review:${this.model}`;
  }

  async callApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "review", strict: true, schema: REVIEW_JSON_SCHEMA },
        },
      }),
    });
    const data = await response.json<OpenRouterResponse>();
    return {
      output: data.choices?.[0]?.message.content ?? "",
      tokenUsage: data.usage
        ? { total: data.usage.total_tokens, prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
        : undefined,
    };
  }
}
