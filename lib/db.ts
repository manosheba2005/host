import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
const dir=process.env.WASLA_DATA_DIR||process.cwd();fs.mkdirSync(dir,{recursive:true});
type DBHolder={db?:DatabaseSync};const g=globalThis as typeof globalThis&DBHolder;
export const db=g.db??(g.db=new DatabaseSync(path.join(dir,'wasla.sqlite')));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,slug TEXT NOT NULL UNIQUE,password TEXT NOT NULL,bio TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS links(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,url TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),link_id INTEGER REFERENCES links(id),kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
if(!(db.prepare('PRAGMA table_info(links)').all() as any[]).some(c=>c.name==='deleted'))db.exec('ALTER TABLE links ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
const userColumns = new Set((db.prepare('PRAGMA table_info(users)').all() as any[]).map(c=>c.name));
for (const [name, definition] of [['tagline', "TEXT NOT NULL DEFAULT ''"], ['avatar', "TEXT NOT NULL DEFAULT ''"], ['cover', "TEXT NOT NULL DEFAULT ''"], ['theme', "TEXT NOT NULL DEFAULT 'lilac'"], ['accent', "TEXT NOT NULL DEFAULT '#7658f5'"], ['business_images', "TEXT NOT NULL DEFAULT '[]'"], ['branches', "TEXT NOT NULL DEFAULT '[]'"]] as const) { if (!userColumns.has(name)) db.exec('ALTER TABLE users ADD COLUMN ' + name + ' ' + definition); }
for (const [name, definition] of [['icon_key', "TEXT NOT NULL DEFAULT 'auto'"], ['icon_url', "TEXT NOT NULL DEFAULT ''"], ['starts_at', "TEXT NOT NULL DEFAULT ''"], ['ends_at', "TEXT NOT NULL DEFAULT ''"]] as const) { if (!(db.prepare('PRAGMA table_info(links)').all() as any[]).some(c=>c.name===name)) db.exec('ALTER TABLE links ADD COLUMN ' + name + ' ' + definition); }
db.exec(`CREATE TABLE IF NOT EXISTS payment_requests(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,sender_wallet TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by INTEGER REFERENCES users(id)); CREATE INDEX IF NOT EXISTS payment_requests_status_created ON payment_requests(status,created_at);`);
db.exec(`CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY,actor_id INTEGER,actor TEXT NOT NULL DEFAULT '',action TEXT NOT NULL,target TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
function addCol(t:string,n:string,d:string){if(!(db.prepare(`PRAGMA table_info(${t})`).all() as any[]).some(c=>c.name===n))db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`)}
for(const [n,d] of [['font',"TEXT NOT NULL DEFAULT 'default'"],['lead_form','INTEGER NOT NULL DEFAULT 0'],['lead_title',"TEXT NOT NULL DEFAULT ''"],['sheets_url',"TEXT NOT NULL DEFAULT ''"]] as const)addCol('users',n,d);
for(const [n,d] of [['kind',"TEXT NOT NULL DEFAULT 'link'"],['extra',"TEXT NOT NULL DEFAULT ''"]] as const)addCol('links',n,d);
for(const [n,d] of [['source',"TEXT NOT NULL DEFAULT ''"],['country',"TEXT NOT NULL DEFAULT ''"],['device',"TEXT NOT NULL DEFAULT ''"]] as const)addCol('events',n,d);
export function audit(actor:any,action:string,target='',details=''){db.prepare('INSERT INTO audit_log(actor_id,actor,action,target,details) VALUES(?,?,?,?,?)').run(actor?.id??null,String(actor?.email||''),action,String(target).slice(0,200),String(details).slice(0,300))}
export function isPaid(id:number){return !!db.prepare("SELECT 1 FROM payment_requests WHERE user_id=? AND status='approved' LIMIT 1").get(id)}
export const adminEmail=(process.env.WASLA_ADMIN_EMAIL||'owner@wasla.local').toLowerCase();
export const monthlyPrice=99;
export const vodafoneCashNumber=process.env.WASLA_VODAFONE_CASH_NUMBER||"01080656762";
export function passwordHash(p:string,s=crypto.randomBytes(16).toString('hex')){return s+':'+crypto.scryptSync(p,s,64).toString('hex')}
export function passwordMatches(p:string,h:string){const[s,v]=h.split(':');if(!s||!v)return false;return crypto.timingSafeEqual(Buffer.from(v,'hex'),crypto.scryptSync(p,s,64))}
export function ensureOwner(){if(!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)){const initialPassword=process.env.WASLA_ADMIN_PASSWORD;if(!initialPassword||initialPassword.length<16)throw new Error('Set WASLA_ADMIN_PASSWORD to a unique password of at least 16 characters before the first run.');db.prepare('INSERT INTO users(name,email,slug,password,bio,active,expires_at) VALUES(?,?,?,?,?,?,?)').run('مالك وصلة',adminEmail,'__owner__',passwordHash(initialPassword),'إدارة المنصة',1,'2999-12-31');}}
export function slugify(x:string){return String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)}
export function isActive(u:any){return !!u.active&&Date.parse(u.expires_at+'T23:59:59Z')>=Date.now()}
export function safeUser(u:any){return{id:u.id,name:u.name,email:u.email,slug:u.slug,bio:u.bio,tagline:u.tagline||'',avatar:u.avatar||'',cover:u.cover||'',theme:u.theme||'lilac',accent:u.accent||'#7658f5',businessImages:JSON.parse(u.business_images||'[]'),branches:JSON.parse(u.branches||'[]'),active:isActive(u),expiresAt:u.expires_at,admin:u.email===adminEmail,font:u.font||'default',leadForm:!!u.lead_form,leadTitle:u.lead_title||'',sheetsUrl:u.sheets_url||'',paid:isPaid(u.id)}}
export function getLinks(id:number){return db.prepare('SELECT id,title,url,position,active,icon_key AS iconKey,icon_url AS iconUrl,starts_at AS startsAt,ends_at AS endsAt,kind,extra FROM links WHERE user_id=? AND deleted=0 ORDER BY position,id').all(id).map((x:any)=>({...x,active:!!x.active}))}
export function scheduled(s:string,e:string){const t=new Date().toISOString().slice(0,10);return (!s||s<=t)&&(!e||e>=t)}
export function validDate(v:any){return v===''||v==null||/^\d{4}-\d{2}-\d{2}$/.test(String(v))}
export function validUrl(v:string){try{return['http:','https:','mailto:','tel:'].includes(new URL(v).protocol)}catch{return false}}

