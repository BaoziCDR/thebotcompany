/**
 * OpenAI Provider - GPT/o-series models via openai SDK
 */

import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const MODEL_PRICING = {
  'gpt-4.1':        { input: 2,   output: 8   },
  'o3':             { input: 2,   output: 8   },
  'o4-mini':        { input: 1.1, output: 4.4 },
  'gpt-5.3-codex':  { input: 1.75, output: 14  },
};

function getPricing(model) {
  // Strip openai/ prefix if present
  const name = model.replace(/^openai\//, '');
  return MODEL_PRICING[name] || MODEL_PRICING['gpt-4.1'];
}

export class OpenAIProvider extends BaseProvider {
  createClient({ token }) {
    return new OpenAI({
      apiKey: token || process.env.OPENAI_API_KEY,
    });
  }

  formatTools(tools) {
    // Convert from Anthropic input_schema format to OpenAI function format
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  buildRequest({ model, systemPrompt, messages, tools, reasoningEffort }) {
    // Strip openai/ prefix
    const modelName = model.replace(/^openai\//, '');

    // Convert Anthropic-style messages to OpenAI format
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        // Could have tool_calls from raw, or be a text message
        if (msg._openai) {
          openaiMessages.push(msg._openai);
        } else if (Array.isArray(msg.content)) {
          // Anthropic format assistant message - extract text
          const text = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
          openaiMessages.push({ role: 'assistant', content: text || '' });
        } else {
          openaiMessages.push({ role: 'assistant', content: msg.content || '' });
        }
      } else if (msg.role === 'user') {
        if (Array.isArray(msg.content) && msg.content[0]?.type === 'tool_result') {
          // Tool results - convert to OpenAI tool messages
          for (const tr of msg.content) {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id || tr.tool_call_id,
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
            });
          }
        } else if (Array.isArray(msg.content)) {
          const text = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
          openaiMessages.push({ role: 'user', content: text });
        } else {
          openaiMessages.push({ role: 'user', content: msg.content || '' });
        }
      }
    }

    const params = {
      model: modelName,
      messages: openaiMessages,
      tools,
      max_completion_tokens: 16384,
    };
    if (reasoningEffort) {
      params.reasoning_effort = reasoningEffort;
    }
    return params;
  }

  async callAPI(client, params, signal) {
    const response = await client.chat.completions.create(params, { signal });

    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls = (message.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    // Map finish_reason to our standard
    let stopReason = 'end_turn';
    if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use';
    if (choice.finish_reason === 'length') stopReason = 'max_tokens';

    return {
      role: 'assistant',
      content: message.content || '',
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        cacheReadTokens: response.usage?.prompt_tokens_details?.cached_tokens || 0,
        reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens || 0,
      },
      raw: message,
    };
  }

  buildAssistantMessage(normalized) {
    // Store the raw OpenAI message for later serialization
    return {
      role: 'assistant',
      content: normalized.raw, // keep raw for text extraction
      _openai: normalized.raw, // marker for buildRequest to use directly
    };
  }

  buildToolResultMessage(results) {
    // OpenAI uses separate tool messages, but we store in our unified format
    // and convert in buildRequest
    return {
      role: 'user',
      content: results.map(r => ({
        type: 'tool_result',
        tool_call_id: r.toolCallId,
        content: r.content,
      })),
    };
  }

  calculateCost(usage, model) {
    const pricing = getPricing(model);
    const cachedTokens = usage.cacheReadTokens || 0;
    const uncachedInput = usage.inputTokens - cachedTokens;
    return (
      (uncachedInput * pricing.input) +
      (cachedTokens * pricing.input * 0.5) +
      (usage.outputTokens * pricing.output)
    ) / 1_000_000;
  }
}
