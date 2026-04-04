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

const PRICE_MAP: Record<string, PriceEntry> = {
  'gpt-4o':                  { inputPer1k: 0.005,  outputPer1k: 0.015 },
  'gpt-4o-mini':             { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4-turbo':             { inputPer1k: 0.01,   outputPer1k: 0.03 },
  'gpt-3.5-turbo':           { inputPer1k: 0.0005,  outputPer1k: 0.0015 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-haiku-20241022':  { inputPer1k: 0.0008, outputPer1k: 0.004 },
  'claude-3-opus-20240229':     { inputPer1k: 0.015, outputPer1k: 0.075 },
};

const DEFAULT_PRICE: PriceEntry = { inputPer1k: 0.002, outputPer1k: 0.010 };

export class StaticPricingService implements IPricingService {
  computeCostUsd({
    modelName,
    inputTokens,
    outputTokens,
  }: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
  }): number {
    // Normalise model name: lower-case, strip date suffixes for lookup
    const key = modelName.toLowerCase();
    const entry = PRICE_MAP[key] ?? DEFAULT_PRICE;
    const cost =
      (inputTokens / 1000) * entry.inputPer1k +
      (outputTokens / 1000) * entry.outputPer1k;
    return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 decimal places
  }
}
