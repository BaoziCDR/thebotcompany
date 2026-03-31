/**
 * Tests for authentication error handling and key rotation.
 *
 * Bug 1: pi-ai natively handles Anthropic OAuth tokens (sk-ant-oat),
 * but our custom opts.headers override was setting 'x-api-key: empty'
 * which conflicted with pi-ai's Bearer auth, causing 401 errors.
 *
 * Bug 2: 401 (authentication_error) was not treated as retryable,
 * so a bad/expired key would fail immediately without trying fallback.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('Auth error handling', () => {
  describe('pi-ai-adapter does not override Anthropic OAuth headers', () => {
    it('buildOptions should NOT set custom x-api-key or Authorization headers for OAuth', () => {
      const adapterPath = path.join(process.cwd(), 'src', 'providers', 'pi-ai-adapter.js');
      const code = fs.readFileSync(adapterPath, 'utf-8');

      // Should NOT have custom x-api-key header override
      assert.ok(!code.includes("'x-api-key': ''"),
        'pi-ai-adapter should NOT set x-api-key to empty — this conflicts with pi-ai native OAuth handling');

      // Should NOT have custom Authorization: Bearer header
      assert.ok(!code.includes("'Authorization': `Bearer"),
        'pi-ai-adapter should NOT set custom Authorization header — pi-ai handles OAuth Bearer auth natively');
    });

    it('buildOptions should just pass token as apiKey and let pi-ai handle auth', () => {
      const adapterPath = path.join(process.cwd(), 'src', 'providers', 'pi-ai-adapter.js');
      const code = fs.readFileSync(adapterPath, 'utf-8');

      // Should have simple apiKey assignment
      assert.ok(code.includes('opts.apiKey = token'),
        'buildOptions should set opts.apiKey = token — pi-ai detects sk-ant-oat and uses Bearer automatically');
    });
  });

  describe('401 triggers key rotation', () => {
    it('agent-runner retry logic should treat 401 as retryable', () => {
      const runnerPath = path.join(process.cwd(), 'src', 'agent-runner.js');
      const code = fs.readFileSync(runnerPath, 'utf-8');

      // Find the isRetryable line
      const match = code.match(/const isRetryable\s*=\s*([^;]+);/);
      assert.ok(match, 'Could not find isRetryable definition in agent-runner.js');

      const retryLogic = match[1];

      // 401 should be in the retryable status codes
      assert.ok(retryLogic.includes('401'),
        `isRetryable should include status 401 for auth errors. Got: ${retryLogic.slice(0, 100)}`);

      // authentication_error should be in the retryable patterns
      assert.ok(/authentication.error|invalid.*api.key/i.test(retryLogic),
        `isRetryable should match authentication_error or invalid api key. Got: ${retryLogic.slice(0, 100)}`);
    });
  });
});
