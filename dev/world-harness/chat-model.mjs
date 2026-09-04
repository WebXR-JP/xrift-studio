// Optional Chat Completions-compatible vision adapter. No provider is selected by default.
import { pathToFileURL } from 'node:url';

export function modelMessages(input) {
  const content = [];
  for (const event of input.events) {
    const copy = structuredClone(event);
    const images = copy.result?.content?.filter(c => c.type === 'image') ?? [];
    if (copy.result?.content) copy.result.content = copy.result.content.filter(c => c.type !== 'image');
    content.push({ type: 'text', text: JSON.stringify(copy) });
    for (const image of images) content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }
  return [
    { role: 'system', content: input.protocol + '\n' + input.instructions },
    { role: 'user', content: [{ type: 'text', text: JSON.stringify({ state: input.state, tools: input.tools }) }, ...content] },
  ];
}

export async function requestAction(input, { endpoint, model, key, fetchImpl = fetch }) {
  if (!endpoint || !model) throw new Error('Set XRIFT_MODEL_ENDPOINT and XRIFT_MODEL.');
  const response = await fetchImpl(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages: modelMessages(input), response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(110000),
  });
  if (!response.ok) throw new Error(`Model HTTP status ${response.status}.`);
  const payload = await response.json();
  const message = payload.choices?.[0]?.message;
  if (!message?.content) throw new Error('Model returned no action.');
  return JSON.parse(message.content);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const action = await requestAction(JSON.parse(input), {
    endpoint: process.env.XRIFT_MODEL_ENDPOINT, model: process.env.XRIFT_MODEL, key: process.env.XRIFT_MODEL_API_KEY,
  });
  process.stdout.write(JSON.stringify(action));
}
