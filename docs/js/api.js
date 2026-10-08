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


  async function post(payload) {
    let res;
    try {
      res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    } catch (e) { throw new Error('No internet connection, or the server could not be reached. Please try again.'); }
    return res.json().catch(() => ({ ok: false, error: 'The server sent an unexpected reply.' }));
  }

  async function call(action, body = {}) {
    if (DEMO) return window.UPMC_DEMO.call(action, body, user || { email: 'demo@example.com', name: 'Demo operator', isAdmin: true });
    if (!token) throw Object.assign(new Error('Please sign in.'), { auth: true });
    const out = await post(Object.assign({ action, token }, body));
    if (!out.ok) {
      const err = new Error(out.error || 'Something went wrong.');
      if (/sign in|sign-in|expired/i.test(out.error || '')) { err.auth = true; setSession(null, null); }
      throw err;
    }
    return out.data;
  }

  window.UPMC_API = {
    DEMO, call,
    get user() { return user; }, get token() { return token; },
    async passwordSignIn(username, password) {
      const out = await post({ action: 'login', username, password });
      if (!out.ok) throw new Error(out.error || 'Could not sign in.');
      setSession(out.data.token, out.data.user);
      return out.data.user;
    },
    demoSignIn() { setSession('demo', { email: 'demo@example.com', name: 'Demo operator', isAdmin: true }); },
    signOut() {
      if (!DEMO && token && token.indexOf('pw.') === 0) post({ action: 'logout', token }).catch(() => {});
      setSession(null, null);
    },
    setAdmin(v) { if (user) { user.isAdmin = v; setSession(token, user); } },
  };
})();
