// Initialize once per database binding so existing deployments upgrade without a separate manual step.
const ready=new WeakMap();
export async function ensureSessionSettings(db){
 if(!ready.has(db)){const p=db.prepare('CREATE TABLE IF NOT EXISTS user_session_settings(user_id TEXT PRIMARY KEY REFERENCES users(id),idle_minutes INTEGER NOT NULL DEFAULT 30 CHECK(idle_minutes BETWEEN 1 AND 480))').run().catch(error=>{ready.delete(db);throw error});ready.set(db,p);}
 await ready.get(db);
}
export const accountIdleMinutes=user=>Number.isInteger(user?.idle_minutes)&&user.idle_minutes>=1&&user.idle_minutes<=480?user.idle_minutes:30;
