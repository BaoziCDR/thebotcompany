/**
 * Provider registry - resolves model string to the appropriate provider.
 */

import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

const anthropic = new AnthropicProvider();
const openai = new OpenAIProvider();

const OPENAI_MODELS = ['gpt-4.1', 'o3', 'o4-mini', 'gpt-5.3-codex'];

/**
 * Get provider and cleaned model name from a model string.
 * - "openai/gpt-4.1" → OpenAI provider, model "openai/gpt-4.1"
 * - "anthropic/claude-opus-4-6" → Anthropic provider, model "claude-opus-4-6"
 * - "claude-opus-4-6" → Anthropic provider (default)
 */
export function getProvider(model) {
  if (model.startsWith('openai/')) {
    return { provider: openai, model };
  }
  if (OPENAI_MODELS.includes(model)) {
    return { provider: openai, model: `openai/${model}` };
  }
  if (model.startsWith('anthropic/')) {
    return { provider: anthropic, model: model.replace(/^anthropic\//, '') };
  }
  // Default: Anthropic
  return { provider: anthropic, model };
}
