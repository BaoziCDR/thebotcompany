export function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim();
  if (!value) throw new Error('customConfig.baseUrl is required');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('customConfig.baseUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('customConfig.baseUrl must use http or https');
  }
  return parsed.toString().replace(/\/$/, '');
}

export function normalizeCustomConfig(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('customConfig is required');
  }

  const apiStyle = String(input.apiStyle || 'openai').trim().toLowerCase();
  if (!['openai', 'anthropic'].includes(apiStyle)) {
    throw new Error('customConfig.apiStyle must be openai or anthropic');
  }

  const defaultModel = String(input.defaultModel || '').trim();
  if (!defaultModel) {
    throw new Error('customConfig.defaultModel is required');
  }

  const normalized = {
    apiStyle,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    defaultModel,
  };

  if (input.tierModels && typeof input.tierModels === 'object') {
    const tierModels = {};
    for (const tier of ['high', 'mid', 'low', 'xlow']) {
      const value = String(input.tierModels[tier] || '').trim();
      if (value) tierModels[tier] = value;
    }
    if (Object.keys(tierModels).length > 0) {
      normalized.tierModels = tierModels;
    }
  }

  return normalized;
}

export function buildCustomTierMap(customConfig) {
  const config = normalizeCustomConfig(customConfig);
  const tierModels = config.tierModels || {};
  const mid = tierModels.mid || config.defaultModel;
  const low = tierModels.low || mid;
  const xlow = tierModels.xlow || low;
  return {
    high: { model: tierModels.high || mid },
    mid: { model: mid },
    low: { model: low },
    xlow: { model: xlow },
  };
}

function fallbackResolveModelTier(tierOrModel, provider, projectModels, runtimeTiers = null) {
  const tier = String(tierOrModel || '').trim().toLowerCase();
  if (projectModels && projectModels[tier]) {
    return { model: projectModels[tier] };
  }
  if (runtimeTiers && runtimeTiers[tier]) {
    return runtimeTiers[tier];
  }
  return { model: tierOrModel };
}

export function resolveProviderRuntime({ provider, modelTier, keyResult, projectModels, resolveModelTier = fallbackResolveModelTier }) {
  if (provider !== 'custom') {
    const selected = resolveModelTier(modelTier, provider, projectModels);
    return {
      provider,
      selectedModel: selected.model,
      reasoningEffort: selected.reasoningEffort || null,
      runtimeTiers: null,
      customConfig: null,
    };
  }

  const customConfig = normalizeCustomConfig(keyResult?.customConfig);
  const runtimeTiers = buildCustomTierMap(customConfig);
  const selected = resolveModelTier(modelTier, provider, projectModels, runtimeTiers);
  return {
    provider,
    selectedModel: selected.model,
    reasoningEffort: selected.reasoningEffort || null,
    runtimeTiers,
    customConfig,
  };
}
