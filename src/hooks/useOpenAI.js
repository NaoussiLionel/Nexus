const $fetch = () => (typeof window.__nativeFetch === 'function' ? window.__nativeFetch : fetch);
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function openaiChat(messages, { model = 'gpt-4o', stream = false, apiKey } = {}) {
  if (!apiKey) throw new Error('OpenAI API key is required');

  const body = {
    model,
    messages: messages.map(m => ({ role: m.role === 'system' ? 'developer' : m.role, content: m.content })),
    stream,
  };

  if (stream) {
    const resp = await $fetch()(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`OpenAI ${resp.status}: ${err}`);
    }

    let buffer = '';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    return {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        while (!buffer.includes('\n')) {
          const { done, value } = await reader.read();
          if (done) {
            const remaining = buffer.trim();
            buffer = '';
            if (remaining && remaining.startsWith('data:') && remaining !== 'data: [DONE]') {
              return parseChunk(remaining);
            }
            return { done: true, value: undefined };
          }
          buffer += decoder.decode(value, { stream: true });
        }

        const idx = buffer.indexOf('\n');
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        return parseChunk(line);
      },
    };
  }

  const resp = await $fetch()(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseChunk(line) {
  if (!line || !line.startsWith('data:') || line === 'data: [DONE]') {
    return { done: false, value: { text: '' } };
  }
  try {
    const json = JSON.parse(line.slice(5));
    const text = json?.choices?.[0]?.delta?.content || '';
    return { done: false, value: { text } };
  } catch {
    return { done: false, value: { text: '' } };
  }
}
