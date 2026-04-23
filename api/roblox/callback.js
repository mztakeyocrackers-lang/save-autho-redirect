const {
  fetchDuplicateLinks,
  fetchJson,
  getConfig,
  getSessionByState,
  isExpired,
  markSession,
  renderPage,
  sendHtml,
} = require('./_lib');

module.exports = async function handler(req, res) {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const state = String(req.query.state || '').trim();
  const code = String(req.query.code || '').trim();
  const oauthError = String(req.query.error || '').trim();

  if (oauthError) {
    sendHtml(res, 400, renderPage({
      title: 'Verification Cancelled',
      tone: 'red',
      body: '<p>Roblox did not finish the authorization flow. Return to Discord and run <code>/verify</code> again when you are ready.</p>',
    }));
    return;
  }

  if (!clientId || !clientSecret || !redirectUri) {
    sendHtml(res, 500, renderPage({
      title: 'Verification Not Ready',
      tone: 'red',
      body: '<p>The Roblox verifier is missing one or more OAuth settings. Add the client id, client secret, and redirect URI in your deploy environment.</p>',
    }));
    return;
  }

  if (!state || !code) {
    sendHtml(res, 400, renderPage({
      title: 'Missing Callback Data',
      tone: 'red',
      body: '<p>The Roblox callback is missing the authorization code or state. Return to Discord and start the verification again.</p>',
    }));
    return;
  }

  try {
    const session = await getSessionByState(state);
    if (!session || session.status !== 'pending' || isExpired(session)) {
      sendHtml(res, 410, renderPage({
        title: 'Verification Link Expired',
        tone: 'red',
        body: '<p>This verification session expired before the Roblox login finished. Go back to Discord and run <code>/verify</code> again.</p>',
      }));
      return;
    }

    const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData?.error_description || tokenData?.message || 'Roblox token exchange failed.');
    }

    const { response: userInfoResponse, data: userInfo } = await fetchJson('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoResponse.ok || !userInfo?.sub) {
      throw new Error(userInfo?.error_description || userInfo?.message || 'Roblox user lookup failed.');
    }

    const duplicateLinks = await fetchDuplicateLinks(String(userInfo.sub), String(session.discord_user_id));
    const duplicateCount = duplicateLinks.length;

    await markSession(state, {
      status: 'completed',
      roblox_user_id: String(userInfo.sub || ''),
      roblox_username: String(userInfo.preferred_username || ''),
      roblox_display_name: String(userInfo.name || userInfo.nickname || ''),
      duplicate_flag: duplicateCount > 0,
      duplicate_count: duplicateCount,
      completed_at: new Date().toISOString(),
      error_message: null,
    });

    sendHtml(res, 200, renderPage({
      title: 'Roblox Verification Complete',
      tone: 'green',
      body: [
        `<p>Your Roblox account <strong>${String(userInfo.preferred_username || 'Unknown')}</strong> has been returned to SAVE Assistant.</p>`,
        '<ul>',
        '<li>Your Discord nickname and verified role will be updated automatically by the bot.</li>',
        duplicateCount > 0
          ? `<li>This Roblox account was <strong>flagged</strong> as a duplicate link on ${duplicateCount} other record(s), but it was not blocked.</li>`
          : '<li>No duplicate Roblox link was detected during this verification.</li>',
        '<li>You can close this page and return to Discord.</li>',
        '</ul>',
      ].join(''),
    }));
  } catch (error) {
    await markSession(state, {
      status: 'failed',
      error_message: String(error?.message || 'Roblox verification failed.').slice(0, 400),
    }).catch(() => null);

    sendHtml(res, 500, renderPage({
      title: 'Roblox Verification Failed',
      tone: 'red',
      body: `<p>The Roblox account could not be linked.</p><p><strong>Reason:</strong> ${String(error?.message || 'Unknown error')}</p>`,
    }));
  }
};
