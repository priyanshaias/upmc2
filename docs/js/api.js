// Talks to the Apps Script API (or the demo backend when no API_URL is set).
(function () {
  const cfg = window.UPMC_CONFIG || {};
  const DEMO = !cfg.API_URL;
  let token = null, user = null;
  try { token = sessionStorage.getItem('upmc_token'); user = JSON.parse(sessionStorage.getItem('upmc_user') || 'null'); } catch (e) {}

  function setSession(t, u) {
    token = t; user = u;
    try { if (t) { sessionStorage.setItem('upmc_token', t); sessionStorage.setItem('upmc_user', JSON.stringify(u)); } else { sessionStorage.clear(); } } catch (e) {}
  }

  // decode the (Google-signed) ID token payload for display only; the server verifies it
  function decode(jwt) {
    try { const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (e) { return {}; }
  }

  async function call(action, body = {}) {
    if (DEMO) return window.UPMC_DEMO.call(action, body, user || { email: 'demo@example.com', name: 'Demo operator', isAdmin: true });
    if (!token) throw Object.assign(new Error('Please sign in with Google.'), { auth: true });
    let res;
    try {
      res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, token }, body)) });
    } catch (e) { throw new Error('No internet connection, or the server could not be reached. Please try again.'); }
    const out = await res.json().catch(() => ({ ok: false, error: 'The server sent an unexpected reply.' }));
    if (!out.ok) {
      const err = new Error(out.error || 'Something went wrong.');
      if (/sign in|sign-in|expired/i.test(out.error || '')) { err.auth = true; setSession(null, null); }
      throw err;
    }
    return out.data;
  }

  window.UPMC_API = {
    DEMO, call, decode,
    get user() { return user; }, get token() { return token; },
    signIn(credential) { const p = decode(credential); setSession(credential, { email: p.email, name: p.name || p.email, picture: p.picture }); },
    demoSignIn() { setSession('demo', { email: 'demo@example.com', name: 'Demo operator', isAdmin: true }); },
    signOut() { setSession(null, null); try { google.accounts.id.disableAutoSelect(); } catch (e) {} },
    setAdmin(v) { if (user) { user.isAdmin = v; setSession(token, user); } },
  };
})();
