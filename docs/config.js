/* Frontend config.
 *
 * Locally:  leave API_BASE empty and the page talks to the same origin
 *           (the backend serves /docs, so http://localhost:3000 works).
 * On GitHub Pages: put your Render URL here, e.g.
 *           API_BASE: 'https://faqja-api.onrender.com'
 */
window.APP_CONFIG = {
  API_BASE: '',
  LIVE_REFRESH_MS: 60000,
  PREMATCH_REFRESH_MS: 120000,
  DEFAULT_LIMIT: 300,
};
