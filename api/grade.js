// api/grade.js — Vercel serverless function. Proxies grading requests to
// the Anthropic Messages API using a server-side API key, so the real key
// never ships to the browser (the old char4-handwrite.html /
// char4-dictation.html called api.anthropic.com directly from client JS
// with no key at all — that only worked inside a Claude.ai artifact
// sandbox, and would be a real credential leak on a public site anyway).
//
// Two shapes of request, both graded the same way (a JSON verdict back):
//   { image, prompt }      — a photo of handwriting (Handwrite, Dictation)
//   { prompt }              — text only, e.g. a speech-recognition
//                             transcript checked against a target word
//                             (Claw's read-aloud pronunciation check)
//
// Setup required in Vercel: Project → Settings → Environment Variables →
// add ANTHROPIC_API_KEY (get one at console.anthropic.com) → redeploy.
// Until that's set, this returns 500 and every caller falls back to its
// manual self-grade flow.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    return;
  }

  var body = req.body || {};
  var image = body.image;
  var prompt = body.prompt;
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required (image is optional — omit it for text-only grading)' });
    return;
  }

  var content = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
        { type: 'text', text: prompt }
      ]
    : [{ type: 'text', text: prompt }];

  try {
    var anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: body.maxTokens || 300,
        messages: [{ role: 'user', content: content }]
      })
    });

    var data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      res.status(anthropicRes.status).json({ error: data.error || data });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: String(err && err.message || err) });
  }
}
