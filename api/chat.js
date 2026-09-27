// /api/chat.js — Vercel serverless function (Node.js runtime)
// Powers the "AI Mitra" chat inside Crisoa using Groq's OpenAI-compatible API.
// Requires the GROQ_API_KEY environment variable to be set in Vercel project settings.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { messages, context } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Keep only the last few turns and only role/content to stay well within token limits.
  const trimmedHistory = messages
    .slice(-12)
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const systemPrompt = [
    "You are AI Mitra, the expense-and-cashflow assistant built into Crisoa (an AI CashFlow Manager for Indian users).",
    "Your ONLY job is to help the user talk through THEIR OWN money: their transactions, spending categories, income, safe-to-spend balance, and goals — using the data supplied below.",
    "You are not a general-purpose chatbot. If asked something totally unrelated to their finances/expenses, gently steer back: e.g. 'Main sirf tumhare hisab-kitab ke baare mein baat kar sakta hoon 🙂'.",
    "Reply in the same language/style the user writes in — Hinglish if they use Hinglish, plain English if they use English.",
    "Keep replies short and concrete: 2-5 sentences, plain text, no markdown headers. Use actual numbers from the data below whenever relevant (amounts, category names, percentages) instead of vague advice.",
    "When the data below has recent transactions or category totals, reference them directly — e.g. name the biggest expense category, compare income vs expense, flag a category that grew, or confirm how much safe-to-spend room is left.",
    "Never promise guaranteed investment returns, never give specific stock/crypto picks, and suggest a licensed advisor only for genuinely major decisions.",
    "If the data below is empty or sparse, say so plainly and suggest the user upload a statement, use SMS Access, or load sample data — don't invent numbers.",
    context ? `User's current expense data (JSON, may be partial): ${JSON.stringify(context).slice(0, 1800)}` : 'No expense data is available yet for this user.'
  ].filter(Boolean).join('\n');

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: systemPrompt }, ...trimmedHistory],
        temperature: 0.5,
        max_tokens: 350
      })
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error('Groq API error:', data);
      return res.status(groqRes.status).json({ error: data?.error?.message || 'Groq request failed' });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't come up with a reply just now — try again?";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('AI Mitra handler error:', err);
    return res.status(500).json({ error: 'Something went wrong talking to AI Mitra.' });
  }
}
