// AI-written meeting requests for "Fix the day", using Google Gemini.
// The key comes from VITE_GEMINI_API_KEY (web/.env.local locally, a GitHub Actions secret for the live site).
// If there is no key, or Gemini fails or is slow, the caller keeps the built-in message.
const KEY = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '').trim()
const MODEL = 'gemini-flash-latest'

export const geminiAvailable = () => KEY.length > 0

export async function draftRequest(ctx: { title: string; from: string; to: string; run: string }): Promise<string | null> {
  if (!KEY) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  const prompt = `Write a short, friendly message (max 45 words) to the organiser of the meeting "${ctx.title}", asking to end it at ${ctx.to} instead of ${ctx.from} today, because the sender has ${ctx.run} of back-to-back meetings and needs a short break in between. Warm and professional, no apologising, no subject line, no placeholders like [Name]. Reply with only the message.`
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : p.text ?? ''))
      .join('')
      .trim()
    return text && text.length < 600 && !/\[.*?\]/.test(text) ? text : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
