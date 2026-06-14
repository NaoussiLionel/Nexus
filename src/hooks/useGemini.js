const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const $fetch = () => (typeof window.__nativeFetch === 'function' ? window.__nativeFetch : fetch);

function buildContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: '[System instruction]\n' + m.content }] });
    } else {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
  }
  return contents;
}

export async function geminiChat(messages, { model = 'gemini-2.5-flash', stream = false, apiKey } = {}) {
  if (!apiKey) throw new Error('Gemini API key is required');

  const contents = buildContents(messages);
  const endpoint = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const url = `${GEMINI_URL}/${model}:${endpoint}&key=${apiKey}`;
  const body = { contents };

  if (stream) {
    const resp = await $fetch()(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`Gemini ${resp.status}: ${err}`);
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

  const resp = await $fetch()(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function geminiChatSync(prompt, { model = 'gemini-2.5-flash', apiKey } = {}) {
  const messages = [{ role: 'user', content: prompt }];
  return geminiChat(messages, { model, apiKey });
}

function parseChunk(line) {
  if (!line || !line.startsWith('data:') || line === 'data: [DONE]') {
    return { done: false, value: { text: '' } };
  }
  try {
    const json = JSON.parse(line.slice(5));
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { done: false, value: { text } };
  } catch {
    return { done: false, value: { text: '' } };
  }
}
