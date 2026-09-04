// XRift's experimental agent loop. Model and tool transports are injected.
import { appendFile, readFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readEvents(file) {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error; // Never silently discard a damaged journal.
  }
}

export function replay(events) {
  const state = { goal: null, pending: null, epoch: 0, context: null, captures: {}, reviews: {}, completed: false };
  for (const event of events) {
    if (event.type === 'goal') state.goal = event.goal;
    if (event.type === 'scene-change') {
      state.context = event.context;
      state.epoch++;
      state.captures = {};
      state.reviews = {};
    }
    if (event.type === 'intent') {
      state.pending = event;
      if (event.mutates) {
        state.epoch++;
        state.captures = {};
        state.reviews = {};
      }
    }
    if (event.type === 'result') {
      state.pending = null;
      if (event.view && !event.result.isError && event.result.content?.some(c => c.type === 'image')) {
        state.captures[event.view] = event.id;
      }
    }
    if (event.type === 'review') state.reviews[event.criterion] = event;
    if (event.type === 'complete') state.completed = true;
  }
  return state;
}

export function completionProblems(state) {
  const problems = [];
  for (const view of ['spawn', 'iso']) {
    if (!state.captures[view]) problems.push(`Capture the current scene from ${view}.`);
  }
  for (const criterion of state.goal.criteria) {
    const review = state.reviews[criterion];
    if (!review?.passed || review.epoch !== state.epoch ||
        !['spawn', 'iso'].every(view => review.captures[view] === state.captures[view])) {
      problems.push(`Review the latest images against: ${criterion}`);
    }
  }
  return problems;
}

/**
 * model.next receives the durable journal (including image content), state and tools.
 * It returns one action: tool, capture, review, finish or pause.
 * Tool adapters must describe each tool as read, view or write; unknown effects fail closed.
 */
export async function runHarness({ journal, goal, model, tools, maxSteps = 30, signal }) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be positive.');
  await mkdir(dirname(journal), { recursive: true });
  const lockPath = `${journal}.lock`;
  const lock = await open(lockPath, 'wx');
  try {
    let events = await readEvents(journal);
    const emit = async event => {
      const entry = { ...event, time: new Date().toISOString() };
      await appendFile(journal, `${JSON.stringify(entry)}\n`);
      events.push(entry);
    };
    if (!events.length) {
      if (!goal?.blueprint?.trim() || !goal.criteria?.length ||
          goal.criteria.some(c => typeof c !== 'string' || !c.trim()) ||
          new Set(goal.criteria).size !== goal.criteria.length) {
        throw new Error('A blueprint and unique completion criteria are required.');
      }
      await emit({ type: 'goal', goal });
    } else if (goal && JSON.stringify(goal) !== JSON.stringify(replay(events).goal)) {
      throw new Error('This journal belongs to a different goal. Use another journal.');
    }
    let state = replay(events);
    if (state.pending) return { status: 'uncertain', intent: state.pending };
    if (state.completed) return { status: 'complete', state };
    const catalog = await tools.list({ signal });
    for (let step = 0; step < maxSteps; step++) {
      signal?.throwIfAborted();
      state = replay(events);
      if (tools.context) {
        const context = await tools.context({ signal });
        if (JSON.stringify(context) !== JSON.stringify(state.context)) {
          await emit({ type: 'scene-change', context });
          state = replay(events);
        }
      }
      const action = await model.next({ events: structuredClone(events), state: structuredClone(state), tools: catalog, signal });
      signal?.throwIfAborted();
      // Model inference may take minutes; recheck before accepting its verdict or edit.
      if (tools.context && JSON.stringify(await tools.context({ signal })) !== JSON.stringify(state.context)) {
        await emit({ type: 'feedback', problems: ['Scene changed during model inference. Refresh before continuing.'] });
        continue;
      }
      if (action.type === 'pause') {
        await emit({ type: 'pause', reason: action.reason });
        return { status: 'paused', reason: action.reason };
      }
      if (action.type === 'finish') {
        const problems = completionProblems(state);
        if (problems.length) { await emit({ type: 'feedback', problems }); continue; }
        await emit({ type: 'complete', summary: action.summary });
        return { status: 'complete', state: replay(events) };
      }
      if (action.type === 'review') {
        if (!state.goal.criteria.includes(action.criterion) ||
            typeof action.passed !== 'boolean' || !action.reason?.trim() ||
            !state.captures.spawn || !state.captures.iso) {
          await emit({ type: 'feedback', problems: ['Review requires a known criterion, both current images, a verdict and a reason.'] });
          continue;
        }
        await emit({ type: 'review', criterion: action.criterion, passed: action.passed,
          reason: action.reason, captures: { ...state.captures }, epoch: state.epoch });
        continue;
      }
      if (!['tool', 'capture'].includes(action.type)) throw new Error('Unknown model action.');
      const capture = action.type === 'capture';
      const name = capture ? 'capture_scene_view' : action.name;
      const definition = catalog.find(tool => tool.name === name);
      if (!definition || !['read', 'view', 'write'].includes(definition.effect)) {
        await emit({ type: 'feedback', problems: [`Tool is not configured: ${name}`] });
        continue;
      }
      if (capture && !['spawn', 'iso'].includes(action.view)) throw new Error('Invalid capture view.');
      // Camera placement is supplied by the adapter, never merely labeled by the model.
      const id = `call-${events.length}`;
      await emit({ type: 'intent', id, name, arguments: action.arguments ?? {},
        mutates: definition.effect === 'write', view: capture ? action.view : undefined });
      let result;
      try {
        result = capture
          ? await tools.capture(action.view, { signal })
          : await tools.call(name, action.arguments ?? {}, { signal });
      } catch (error) {
        // A transport error does not prove that the remote edit failed.
        await emit({ type: 'transport-error', id, message: error.message });
        return { status: 'uncertain', intent: replay(events).pending };
      }
      await emit({ type: 'result', id, result, view: capture ? action.view : undefined });
    }
    await emit({ type: 'pause', reason: 'Step budget reached; resume with the same journal.' });
    return { status: 'paused', reason: 'step-budget' };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
