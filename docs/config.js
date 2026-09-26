/* Frontend config.
 *
 * Locally:  leave API_BASE empty and the page talks to the same origin
 *           (the backend serves /docs, so http://localhost:3000 works).
 * On GitHub Pages: put your Railway URL here, e.g.
 *           API_BASE: 'https://<your-service>.up.railway.app'
 */
window.APP_CONFIG = {
  API_BASE: '',
  LIVE_REFRESH_MS: 60000,
  PREMATCH_REFRESH_MS: 120000,
  DEFAULT_LIMIT: 300,
};
