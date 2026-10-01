import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0002_portal_menu.sql',import.meta.url),'utf8'));
 const prepared=(sql,args=[])=>({
  bind(...values){return prepared(sql,values);},
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}
 });
 return {prepare:prepared,async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},raw:db};
}
