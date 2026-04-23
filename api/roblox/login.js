const {
  getConfig,
  getSessionByState,
  isExpired,
  renderPage,
  sendHtml,
} = require('./_lib');

module.exports = async function handler(req, res) {
  const { clientId, redirectUri } = getConfig();
  const state = String(req.query.state || '').trim();

  if (!clientId || !redirectUri) {
    sendHtml(res, 500, renderPage({
      title: 'Verification Not Ready',
      tone: 'red',
      body: '<p>The Roblox verifier is not configured yet. Add the Roblox OAuth client id and redirect URI before using this route.</p>',
    }));
    return;
  }

  if (!state) {
    sendHtml(res, 400, renderPage({
      title: 'Missing Verification State',
      tone: 'red',
      body: '<p>This verification link is missing its session state. Go back to Discord and run <code>/verify</code> again.</p>',
    }));
    return;
  }

  try {
    const session = await getSessionByState(state);
    if (!session || session.status !== 'pending' || isExpired(session)) {
      sendHtml(res, 410, renderPage({
        title: 'Verification Link Expired',
        tone: 'red',
        body: '<p>This verification session is no longer valid. Return to Discord and run <code>/verify</code> to create a fresh link.</p>',
      }));
      return;
    }

    const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile');
    url.searchParams.set('state', state);

    res.statusCode = 302;
    res.setHeader('Location', url.toString());
    res.end();
  } catch (error) {
    sendHtml(res, 500, renderPage({
      title: 'Verification Failed',
      tone: 'red',
      body: `<p>The Roblox verification session could not be loaded.</p><p><strong>Reason:</strong> ${String(error?.message || 'Unknown error')}</p>`,
    }));
  }
};
