// Cloudflare Pages Function — routes to POST /api/contact
// Deploy path in your repo:  functions/api/contact.js
//
// Required environment variables (Cloudflare Pages → Settings → Environment variables,
// set as ENCRYPTED secrets — never commit them):
//   RESEND_API_KEY   your Resend API key
//   CONTACT_TO       where the message lands, e.g. jason.systema@gmail.com
//   CONTACT_FROM     a verified sender on your domain, e.g. form@carbon-silicon.org

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function bad(status, msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: JSON_HEADERS });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function onRequestPost({ request, env }) {
  // Same-origin guard: reject cross-site POSTs early.
  const origin = request.headers.get('Origin') || '';
  if (origin && !/^https?:\/\/([a-z0-9-]+\.)?carbon-silicon\.org$/i.test(origin)
            && !/^https?:\/\/([a-z0-9-]+\.)?pages\.dev$/i.test(origin)
            && !/^https?:\/\/localhost(:\d+)?$/i.test(origin)) {
    return bad(403, 'Origin not allowed.');
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return bad(400, 'Malformed request body.');
  }

  const name = (data.name || '').toString().trim();
  const email = (data.email || '').toString().trim();
  const message = (data.message || '').toString().trim();

  if (!name || !email || !message) return bad(422, 'Missing required fields.');
  if (name.length > 200 || email.length > 320 || message.length > 8000) return bad(422, 'Field too long.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(422, 'Invalid email.');

  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    return bad(500, 'Mail not configured.');
  }

  const subject = `carbon-silicon.org — message from ${name}`;
  const text =
`New message via carbon-silicon.org/contact

From:    ${name} <${email}>
Time:    ${new Date().toISOString()}

${message}
`;
  const html =
`<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#1a1a17">
  <p style="font-family:monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#2C5F4F">
    carbon-silicon.org · contact
  </p>
  <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br>
     <strong>Time:</strong> ${new Date().toISOString()}</p>
  <hr style="border:none;border-top:1px solid #E8E1D2">
  <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
</div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: email,        // hitting "reply" answers the sender directly
      subject,
      text,
      html,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return new Response(JSON.stringify({ ok: false, error: 'Delivery failed.', detail }),
      { status: 502, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
}

// Anything other than POST
export async function onRequest({ request }) {
  if (request.method === 'POST') return; // handled above
  return bad(405, 'Method not allowed.');
}
