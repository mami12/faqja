/**
 * Durable and auditable live risk settings. All actual wallet debits take the
 * same singleton row lock, serializing match-exposure checks across users.
 */
import { query, pool } from '../db.mjs';
import {
  DEFAULT_LIVE_RISK_SETTINGS, liveRiskSettings,
  validateLiveRiskSettings, setLiveRiskSettings,
} from '../live-risk-settings.mjs';

export async function refreshLiveRiskSettings({ initialize = false } = {}) {
  if (initialize) {
    await query(
      `insert into app_live_risk_settings (id,settings)
       values (1,$1::jsonb) on conflict (id) do nothing`,
      [JSON.stringify(DEFAULT_LIVE_RISK_SETTINGS)],
    );
  }
  const { rows } = await query('select settings from app_live_risk_settings where id=1');
  if (!rows.length) throw new Error('Live risk settings are not initialized.');
  const settings = validateLiveRiskSettings(rows[0].settings);
  if (JSON.stringify(liveRiskSettings()) !== JSON.stringify(settings)) setLiveRiskSettings(settings);
  return settings;
}

export async function lockLiveRiskSettings(client) {
  const { rows } = await client.query(
    'select settings from app_live_risk_settings where id=1 for update',
  );
  if (!rows.length) throw new Error('Live risk settings unavailable.');
  return validateLiveRiskSettings(rows[0].settings);
}

export async function writeLiveRiskSettings(value, actor) {
  const settings = validateLiveRiskSettings(value);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `update app_live_risk_settings
         set settings=$1::jsonb, updated_by=$2, updated_at=now()
         where id=1 returning updated_at as "updatedAt"`,
      [JSON.stringify(settings),actor.id],
    );
    if (!rows.length) throw new Error('Live risk settings row missing.');
    await client.query(
      `insert into app_admin_audit
         (actor_id,actor_name,actor_role,action,target_type,target_id,details)
       values ($1,$2,$3,'UPDATE LIVE_RISK','settings','live-risk',$4::jsonb)`,
      [actor.id,actor.username,actor.role,JSON.stringify({ settings })],
    );
    await client.query('commit');
    setLiveRiskSettings(settings);
    return { settings, updatedAt: rows[0].updatedAt };
  } catch(e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally { client.release(); }
}
