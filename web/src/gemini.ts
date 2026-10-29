// AI-written meeting requests for "Fix the day", using Google Gemini.
// The key comes from VITE_GEMINI_API_KEY (web/.env.local locally, a GitHub Actions secret for the live site).
// If there is no key, or Gemini fails or is slow, the caller keeps the built-in message.
const KEY = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '').trim()
// Tried in order: if one is overloaded (503) or unavailable, the next one gets a go.
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest']

export const geminiAvailable = () => KEY.length > 0

export async function draftRequest(ctx: { title: string; from: string; to: string; run: string }): Promise<string | null> {
  if (!KEY) return null
  const prompt = `Write a short, friendly message (max 45 words) to the organiser of the meeting "${ctx.title}", asking to end it at ${ctx.to} instead of ${ctx.from} today, because the sender has ${ctx.run} of back-to-back meetings and needs a short break in between. Warm and professional, no apologising, no subject line, no placeholders like [Name]. Reply with only the message.`
  for (const model of MODELS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6_000)
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } }),
        signal: ctrl.signal,
      })
      if (!res.ok) continue
      const data = await res.json()
      const text: string = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : p.text ?? ''))
        .join('')
        .trim()
      if (text && text.length < 600 && !/\[.*?\]/.test(text)) return text
    } catch {
      /* timeout or network error: try the next model */
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}
