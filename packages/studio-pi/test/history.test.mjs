import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { openHistory, historySummary } from '../dist/history.js';

test('resume after a killed tool batch selects a completed response and preserves the abandoned branch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-safe-resume-'));
  try {
    const stored = { id: 'root', path: join(directory, 'session.jsonl') };
    const manager = await openHistory(stored);
    const safe = manager.appendMessage(fauxAssistantMessage('completed response'));
    const pending = manager.appendMessage(fauxAssistantMessage(fauxToolCall('pending_tool', {}), { stopReason: 'toolUse' }));
    const resumed = await openHistory(stored);
    assert.equal(resumed.getLeafId(), safe);
    assert.ok(resumed.getEntry(pending));
    assert.equal(historySummary(resumed, 'root').leafId, safe);
    resumed.appendCustomEntry('state-after-response', { ok: true });
    assert.equal(historySummary(resumed, 'root').leafId, safe);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
