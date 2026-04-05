/**
 * Pricing service interface.
 *
 * Swap guide: replace StaticPricingService with a DB-backed or remote config
 * implementation without touching the workers.
 */
export interface IPricingService {
  computeCostUsd(params: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
  }): number;
}

type PriceEntry = { inputPer1k: number; outputPer1k: number };

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

type LiteLLMEntry = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
};

/**
 * Fetches live pricing from LiteLLM's community-maintained model price map.
 * Call `await pricing.init()` once at startup.
 *
 * If a model is not found, cost is recorded as 0 and a warning is logged.
 * Tokens are always stored, so cost can be back-filled later once pricing
 * is configured (e.g. via a DB-backed implementation).
 */
export class LiteLLMPricingService implements IPricingService {
  private cache = new Map<string, PriceEntry>();

  async init(): Promise<void> {
    try {
      const res = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, LiteLLMEntry>;

      for (const [model, entry] of Object.entries(json)) {
        if (
          typeof entry.input_cost_per_token === 'number' &&
          typeof entry.output_cost_per_token === 'number'
        ) {
          this.cache.set(model.toLowerCase(), {
            // LiteLLM stores cost per token; convert to per 1k
            inputPer1k:  entry.input_cost_per_token  * 1000,
            outputPer1k: entry.output_cost_per_token * 1000,
          });
        }
      }
      console.log(`LiteLLM pricing loaded: ${this.cache.size} models`);
    } catch (err) {
      console.warn('LiteLLM pricing fetch failed — all model costs will be recorded as 0:', err);
    }
  }

  computeCostUsd({
    modelName,
    inputTokens,
    outputTokens,
  }: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
  }): number {
    const key = modelName.toLowerCase();
    const entry = this.cache.get(key);
    if (!entry) {
      console.warn(`[pricing] unknown model "${modelName}" — cost recorded as 0 (tokens saved for retro)`);
      return 0;
    }
    const cost =
      (inputTokens  / 1000) * entry.inputPer1k +
      (outputTokens / 1000) * entry.outputPer1k;
    return Math.round(cost * 1_000_000) / 1_000_000;
  }
}
