import {
  projectGenerationBudgetSchema,
  type GeneratedAssetProviderId,
  type ProjectGenerationBudget,
} from "../contracts/index.js";
import type {
  AssetGenerationRequest,
  GeneratedAssetProvider,
  GenerationCostEstimate,
  ProviderCapabilities,
} from "../providers/generated/index.js";
import { defaultAssetProviderPreference } from "./asset-planner.js";

export interface AllowedGenerationBudget {
  allowed: true;
  remaining_cash_cny: number;
}

export interface RefusedGenerationBudget {
  allowed: false;
  remaining_cash_cny: number;
  reason: string;
}

export type GenerationBudgetDecision = AllowedGenerationBudget | RefusedGenerationBudget;

export interface RoutedProvider {
  status: "ROUTED";
  provider: GeneratedAssetProvider;
  provider_id: GeneratedAssetProviderId;
  capabilities: ProviderCapabilities;
  estimate: GenerationCostEstimate;
}

export interface WaitingForProviderAction {
  status: "WAITING_USER_ACTION";
  reason: string;
  provider_id?: GeneratedAssetProviderId;
}

export type ProviderRoute = RoutedProvider | WaitingForProviderAction;

/**
 * Selects a provider without preparing or submitting work. Keeping this phase
 * side-effect free lets the caller enforce every cash limit before a paid API
 * could receive a request.
 */
export class GeneratedAssetProviderRouter {
  private readonly providers: ReadonlyMap<GeneratedAssetProviderId, GeneratedAssetProvider>;

  constructor(providers: readonly GeneratedAssetProvider[]) {
    const byId = new Map<GeneratedAssetProviderId, GeneratedAssetProvider>();
    for (const provider of providers) {
      if (byId.has(provider.id)) {
        throw new Error(`Duplicate generated asset provider id: ${provider.id}`);
      }
      byId.set(provider.id, provider);
    }
    this.providers = byId;
  }

  async route(
    request: AssetGenerationRequest,
    budgetInput: ProjectGenerationBudget,
  ): Promise<ProviderRoute> {
    const budget = projectGenerationBudgetSchema.parse(budgetInput);
    const preferences = request.asset.generation?.provider_preference ?? defaultAssetProviderPreference;
    const unavailableProviders: string[] = [];

    for (const providerId of preferences) {
      const provider = this.providers.get(providerId);
      if (provider === undefined) {
        unavailableProviders.push(`${providerId}: not configured`);
        continue;
      }

      const capabilities = await provider.capabilities();
      if (!capabilities.available) {
        unavailableProviders.push(`${providerId}: ${capabilities.unavailable_reason ?? "unavailable"}`);
        continue;
      }

      let estimate: GenerationCostEstimate;
      try {
        estimate = await provider.estimate(request);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "cost metadata is unavailable";
        return {
          status: "WAITING_USER_ACTION",
          provider_id: providerId,
          reason: `Cannot estimate ${providerId} before submission: ${detail}`,
        };
      }

      const budgetDecision = evaluateGenerationBudget(budget, estimate, request);
      if (!budgetDecision.allowed) {
        return {
          status: "WAITING_USER_ACTION",
          provider_id: providerId,
          reason: budgetDecision.reason,
        };
      }

      return {
        status: "ROUTED",
        provider,
        provider_id: providerId,
        capabilities,
        estimate,
      };
    }

    return {
      status: "WAITING_USER_ACTION",
      reason: `No provider is available for ${request.asset.asset_id}. ${unavailableProviders.join("; ")}`,
    };
  }
}

export function evaluateGenerationBudget(
  budgetInput: ProjectGenerationBudget,
  estimate: GenerationCostEstimate,
  request: Pick<AssetGenerationRequest, "asset">,
): GenerationBudgetDecision {
  const budget = projectGenerationBudgetSchema.parse(budgetInput);
  const remainingCashCny = budget.generation_cash_cny - budget.used_cash_cny;

  if (!Number.isFinite(estimate.cash_cost_cny) || estimate.cash_cost_cny < 0) {
    return {
      allowed: false,
      remaining_cash_cny: remainingCashCny,
      reason: "Provider returned an invalid cash estimate",
    };
  }

  if (estimate.cash_cost_cny > remainingCashCny) {
    return {
      allowed: false,
      remaining_cash_cny: remainingCashCny,
      reason: `Estimated cash cost ${estimate.cash_cost_cny} CNY exceeds remaining project budget ${remainingCashCny} CNY`,
    };
  }

  const requestCashBudget = request.asset.generation?.cash_budget_cny;
  if (requestCashBudget !== undefined && estimate.cash_cost_cny > requestCashBudget) {
    return {
      allowed: false,
      remaining_cash_cny: remainingCashCny,
      reason: `Estimated cash cost ${estimate.cash_cost_cny} CNY exceeds request budget ${requestCashBudget} CNY`,
    };
  }

  return { allowed: true, remaining_cash_cny: remainingCashCny };
}

export function applyGenerationEstimate(
  budgetInput: ProjectGenerationBudget,
  estimate: GenerationCostEstimate,
  request: Pick<AssetGenerationRequest, "asset">,
): ProjectGenerationBudget {
  const budget = projectGenerationBudgetSchema.parse(budgetInput);
  const decision = evaluateGenerationBudget(budget, estimate, request);
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  return projectGenerationBudgetSchema.parse({
    generation_cash_cny: budget.generation_cash_cny,
    used_cash_cny: budget.used_cash_cny + estimate.cash_cost_cny,
    subscription_generation_count:
      budget.subscription_generation_count + (estimate.subscription_quota_used ? 1 : 0),
  });
}
