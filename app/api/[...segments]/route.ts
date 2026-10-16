import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { adminEmail, db, getLinks, isActive, monthlyPrice, passwordHash, passwordMatches, safeUser, scheduled, validDate, audit, isPaid, slugify, validUrl, vodafoneCashNumber } from "@/lib/db";
export const runtime = "nodejs";
const SESSION = "wasla_session";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const attempts = new Map<string,{n:number;t:number}>();
async function body(req: NextRequest) { return req.json().catch(() => ({})); }
function parts(req: NextRequest) { return new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean); }
async function current() {
  const jar = await cookies(), token = jar.get(SESSION)?.value;
  if (!token) return null;
  const session = db.prepare("SELECT user_id,expires FROM sessions WHERE token=?").get(token) as any;
  if (!session || session.expires < Date.now()) { if (session) db.prepare("DELETE FROM sessions WHERE token=?").run(token); return null; }
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(session.user_id) as any;
  return user ? { ...user, admin: user.email === adminEmail } : null;
}
function sessionResponse(user: any, token: string, status = 200) {
  const res = NextResponse.json({ user: safeUser(user) }, { status });
  res.cookies.set(SESSION, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return res;
}
export async function GET(req: NextRequest) {
  try {
    const p = parts(req);
    if (p[0] === "health") return NextResponse.json({ ok: true });
    if (p[0] === "leads" || p[0] === "leads.csv") {
      const lu = await current(); if (!lu || lu.admin) return fail("غير مصرح.", 401);
      const rows = db.prepare("SELECT id,name,contact,message,created_at FROM leads WHERE user_id=? ORDER BY id DESC LIMIT 1000").all(lu.id) as any[];
      if (p[0] === "leads") return NextResponse.json({ leads: rows.slice(0, 200) });
      const cell = (v: any) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const csv = "﻿" + ["الاسم,التواصل,الرسالة,التاريخ", ...rows.map(r => [r.name, r.contact, r.message, r.created_at].map(cell).join(","))].join("\r\n");
      return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="wasla-leads.csv"' } });
    }
    if (p[0] === "me") {
      const user = await current(); if (!user) return fail("سجّل الدخول أولًا.", 401);
      if (user.admin) return NextResponse.json({ user: safeUser(user), links: [], stats: {} });
      const range = new URL(req.url).searchParams.get("range") === "30" ? 30 : 7;
      const since = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10) + " 00:00:00";
      const visits = (db.prepare("SELECT COUNT(*) n FROM events WHERE user_id=? AND kind='view' AND created_at>=?").get(user.id, since) as any).n;
      const clicks = (db.prepare("SELECT COUNT(*) n FROM events WHERE user_id=? AND kind='click' AND created_at>=?").get(user.id, since) as any).n;
      const top = db.prepare("SELECT l.id,l.title,COUNT(e.id) clicks FROM links l LEFT JOIN events e ON e.link_id=l.id AND e.kind='click' AND e.created_at>=? WHERE l.user_id=? AND l.deleted=0 GROUP BY l.id ORDER BY clicks DESC").all(since, user.id);
      const raw = db.prepare("SELECT substr(created_at,1,10) day,COUNT(*) count FROM events WHERE user_id=? AND kind='view' AND created_at>=? GROUP BY day ORDER BY day").all(user.id, since) as any[];
      const dm = new Map(raw.map(x => [x.day, x.count]));
      const days = Array.from({ length: range }, (_, i) => { const d = new Date(Date.now() - (range - 1 - i) * 864e5), k = d.toISOString().slice(0, 10); return { day: k, label: d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }), count: dm.get(k) || 0 }; });
      const grp = (col: string) => db.prepare(`SELECT COALESCE(NULLIF(${col},''),'unknown') k,COUNT(*) n FROM events WHERE user_id=? AND kind='view' AND created_at>=? GROUP BY k ORDER BY n DESC LIMIT 8`).all(user.id, since);
      const byHour = db.prepare("SELECT CAST(strftime('%H',created_at) AS INTEGER) h,COUNT(*) n FROM events WHERE user_id=? AND kind='view' AND created_at>=? GROUP BY h").all(user.id, since);
      const leadsN = (db.prepare("SELECT COUNT(*) n FROM leads WHERE user_id=?").get(user.id) as any).n;
      return NextResponse.json({ user: safeUser(user), links: getLinks(user.id), stats: { visits, clicks, top, days, bySource: grp("source"), byDevice: grp("device"), byCountry: grp("country"), byHour, leads: leadsN } });
    }
    if (p[0] === "admin" && p[1] === "summary") {
      const user = await current(); if (!user?.admin) return fail("للمالك فقط.", 403);
      const customers = db.prepare("SELECT id,name,email,slug,active,expires_at,created_at,theme FROM users WHERE email<>? ORDER BY created_at DESC").all(adminEmail) as any[];
      const today = new Date().toISOString().slice(0, 10);
      const activeCount = customers.filter(c => c.active && c.expires_at >= today).length;
      const rows = db.prepare("SELECT strftime('%Y-%m',created_at) month,COUNT(*) count FROM users WHERE email<>? AND created_at>=date('now','start of month','-5 months') GROUP BY month ORDER BY month").all(adminEmail) as any[];
      const byMonth = new Map(rows.map(x => [x.month, x.count]));
      const monthly = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); const key = d.toISOString().slice(0, 7); return { label: d.toLocaleDateString("ar-EG", { month: "short" }), count: byMonth.get(key) || 0 }; });
      const list = customers.map(c => ({ ...c, active: !!c.active && c.expires_at >= today, visits: (db.prepare("SELECT COUNT(*) n FROM events WHERE user_id=? AND kind='view'").get(c.id) as any).n }));
      const paymentRequests = db.prepare("SELECT p.id,p.user_id,p.sender_wallet,p.reference,p.amount,p.status,p.created_at,p.reviewed_at,u.name,u.email,u.slug FROM payment_requests p JOIN users u ON u.id=p.user_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.id DESC LIMIT 50").all();
      return NextResponse.json({ customers: list, monthly, paymentRequests, totals: { customers: list.length, active: activeCount } });
    }
    if (p[0] === "billing" && p[1] === "status") {
      const user = await current(); if (!user || user.admin) return fail("غير مصرح.", 401);
      const request = db.prepare("SELECT id,sender_wallet,reference,amount,status,created_at,reviewed_at FROM payment_requests WHERE user_id=? ORDER BY id DESC LIMIT 1").get(user.id) || null;
      return NextResponse.json({ request, monthlyPrice, recipient: vodafoneCashNumber });
    }
    if (p[0] === "public" && p[1]) {
      const user = db.prepare("SELECT * FROM users WHERE slug=?").get(p[1]) as any;
      if (!user || !isActive(user)) return fail("الصفحة غير متاحة حاليًا.", 404);
      const viewer = await current(), bot = /bot|crawl|spider|preview|curl|facebookexternalhit/i.test(req.headers.get("user-agent") || "");
      if (!bot && viewer?.id !== user.id) {
        const sp = new URL(req.url).searchParams, ref = (sp.get("ref") || "").toLowerCase(), ua = req.headers.get("user-agent") || "";
        let src = (sp.get("src") || "").toLowerCase();
        if (!["qr","instagram","whatsapp","facebook","tiktok","twitter","telegram","youtube"].includes(src)) src = ref.includes("instagram") ? "instagram" : ref.includes("wa.me") || ref.includes("whatsapp") ? "whatsapp" : ref.includes("facebook") || ref.includes("fb.") ? "facebook" : ref.includes("tiktok") ? "tiktok" : ref.includes("t.co") || ref.includes("twitter") || ref.includes("x.com") ? "twitter" : ref.includes("t.me") || ref.includes("telegram") ? "telegram" : ref.includes("youtube") ? "youtube" : ref ? "other" : "direct";
        const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";
        const ctry = (req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || req.headers.get("x-country") || "").toUpperCase().slice(0, 2);
        db.prepare("INSERT INTO events(user_id,kind,source,country,device) VALUES(?,'view',?,?,?)").run(user.id, src, ctry, device);
      }
      return NextResponse.json({ user: { name:user.name,bio:user.bio,tagline:user.tagline||'',slug:user.slug,avatar:user.avatar||'',cover:user.cover||'',theme:user.theme||'lilac',accent:user.accent||'#7658f5',businessImages:JSON.parse(user.business_images||'[]'),branches:JSON.parse(user.branches||'[]'),font:user.font||'default',leadForm:!!user.lead_form,leadTitle:user.lead_title||'',paid:isPaid(user.id) }, links:getLinks(user.id).filter((l:any)=>l.active&&scheduled(l.startsAt,l.endsAt)) });
    }
    if (p[0] === "r" && p[1] && p[2]) {
      const user = db.prepare("SELECT * FROM users WHERE slug=?").get(p[1]) as any;
      const link = user && db.prepare("SELECT * FROM links WHERE id=? AND user_id=? AND active=1 AND deleted=0").get(Number(p[2]), user.id) as any;
      if (!user || !isActive(user) || !link || !scheduled(link.starts_at, link.ends_at)) return fail("الرابط غير متاح.", 404);
      db.prepare("INSERT INTO events(user_id,link_id,kind) VALUES(?,?,'click')").run(user.id, link.id);
      return NextResponse.redirect(new URL(link.url));
    }
    return fail("غير موجود.", 404);
  } catch (e) { console.error(e); return fail("حدث خطأ داخلي.", 500); }
}
export async function POST(req: NextRequest) {
  try {
    const p = parts(req), d = await body(req);
    if (p[0] === "lead" && p[1]) {
      const k = "lead|" + (req.headers.get("x-forwarded-for") || "local") + "|" + p[1], now = Date.now(), a1 = attempts.get(k), fresh = !!a1 && now - a1.t < 600000;
      if (fresh && a1!.n >= 5) return fail("محاولات كثيرة. حاول لاحقًا.", 429);
      attempts.set(k, { n: fresh ? a1!.n + 1 : 1, t: fresh ? a1!.t : now });
      const lo = db.prepare("SELECT * FROM users WHERE slug=?").get(p[1]) as any;
      if (!lo || !isActive(lo) || !lo.lead_form) return fail("النموذج غير متاح.", 404);
      const contact = String(d.contact || "").trim().slice(0, 120), lname = String(d.name || "").trim().slice(0, 80), message = String(d.message || "").trim().slice(0, 500);
      if (contact.length < 3) return fail("أدخل إيميلًا أو رقم هاتف صحيحًا.");
      db.prepare("INSERT INTO leads(user_id,name,contact,message) VALUES(?,?,?,?)").run(lo.id, lname, contact, message);
      if (lo.sheets_url) fetch(lo.sheets_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: lname, contact, message, date: new Date().toISOString() }), signal: AbortSignal.timeout(5000) }).catch(() => {});
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (p[0] === "auth" && p[1] === "logout") {
      const jar = await cookies(), token = jar.get(SESSION)?.value; if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
      const res = NextResponse.json({ ok: true }); res.cookies.delete(SESSION); return res;
    }
    if (p[0] === "auth" && p[1] === "register") {
      if (!d.name || !d.email || String(d.password || "").length < 10) return fail("أدخل الاسم والبريد وكلمة مرور من 10 أحرف على الأقل.");
      const email = String(d.email).trim().toLowerCase();
      if (email === adminEmail || db.prepare("SELECT id FROM users WHERE email=?").get(email)) return fail("البريد مستخدم بالفعل.", 409);
      let slug = slugify(d.slug || "") || `page-${crypto.randomBytes(3).toString("hex")}`;
      if (db.prepare("SELECT id FROM users WHERE slug=?").get(slug)) slug += `-${crypto.randomBytes(2).toString("hex")}`;
      const expires = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      const result = db.prepare("INSERT INTO users(name,email,slug,password,bio,expires_at) VALUES(?,?,?,?,?,?)").run(String(d.name).slice(0, 80), email, slug, passwordHash(String(d.password)), String(d.bio || "").slice(0, 160), expires);
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(Number(result.lastInsertRowid)) as any;
      const token = crypto.randomBytes(32).toString("hex"); db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(token, user.id, Date.now() + 30 * 864e5);
      return sessionResponse(user, token, 201);
    }
    if (p[0] === "auth" && p[1] === "login") {
      const key = (req.headers.get("x-forwarded-for") || "local") + "|" + String(d.email || "").toLowerCase(), now = Date.now(), a0 = attempts.get(key);
      if (a0 && now - a0.t < 15 * 60000 && a0.n >= 8) return fail("محاولات كثيرة. حاول بعد ١٥ دقيقة.", 429);
      const user = db.prepare("SELECT * FROM users WHERE email=?").get(String(d.email || "").trim().toLowerCase()) as any;
      if (!user || !passwordMatches(String(d.password || ""), user.password)) { const c0 = attempts.get(key); attempts.set(key, { n: c0 && now - c0.t < 15 * 60000 ? c0.n + 1 : 1, t: c0 && now - c0.t < 15 * 60000 ? c0.t : now }); return fail("البريد أو كلمة المرور غير صحيحة.", 401); }
      attempts.delete(key);
      if (user.email === adminEmail) audit(user, "admin_login", user.email);
      const token = crypto.randomBytes(32).toString("hex"); db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(token, user.id, Date.now() + 30 * 864e5);
      return sessionResponse(user, token);
    }
    if (p[0] === "billing" && p[1] === "request") {
      const user = await current(); if (!user || user.admin) return fail("غير مصرح.", 401);
      let sender = String(d.senderWallet || "").replace(/[\s()-]/g, "");
      if (sender.startsWith("+20")) sender = "0" + sender.slice(3); else if (sender.startsWith("0020")) sender = "0" + sender.slice(4);
      if (!/^01[0125]\d{8}$/.test(sender)) return fail("أدخل رقم محفظة مصريًا صحيحًا يبدأ بـ 010 أو 011 أو 012 أو 015.");
      const pending = db.prepare("SELECT id FROM payment_requests WHERE user_id=? AND status='pending'").get(user.id);
      if (pending) return fail("لديك طلب دفع قيد المراجعة بالفعل.", 409);
      const reference = String(d.reference || "").trim().slice(0, 80);
      const result = db.prepare("INSERT INTO payment_requests(user_id,sender_wallet,reference,amount) VALUES(?,?,?,?)").run(user.id,sender,reference,monthlyPrice);
      const request = db.prepare("SELECT id,sender_wallet,reference,amount,status,created_at,reviewed_at FROM payment_requests WHERE id=?").get(Number(result.lastInsertRowid));
      return NextResponse.json({ request, monthlyPrice, recipient: vodafoneCashNumber }, { status: 201 });
    }
    if (p[0] === "admin" && p[1] === "payment-requests" && p[2] && p[3] === "review") {
      const owner = await current(); if (!owner?.admin) return fail("للمالك فقط.", 403);
      const decision = d.decision === "approve" ? "approved" : d.decision === "reject" ? "rejected" : null;
      if (!decision) return fail("اختر الموافقة أو الرفض.");
      db.exec("BEGIN");
      try {
        const request = db.prepare("SELECT id,user_id FROM payment_requests WHERE id=? AND status='pending'").get(Number(p[2])) as any;
        if (!request) { db.exec("ROLLBACK"); return fail("طلب الدفع غير موجود أو تمت مراجعته.", 409); }
        db.prepare("UPDATE payment_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='pending'").run(decision,owner.id,request.id);
        if (decision === "approved") db.prepare("UPDATE users SET active=1,expires_at=date(CASE WHEN expires_at<date('now') THEN date('now') ELSE expires_at END,'+30 day') WHERE id=?").run(request.user_id);
        db.exec("COMMIT");
        const tu = db.prepare("SELECT name,email FROM users WHERE id=?").get(request.user_id) as any;
        audit(owner, decision === "approved" ? "payment_approved" : "payment_rejected", "طلب دفع #" + request.id, (tu?.name || "") + " · " + (tu?.email || ""));
        return NextResponse.json({ ok: true, status: decision });
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    }
    if (p[0] === "admin" && p[1] === "customers") {
      const owner = await current(); if (!owner?.admin) return fail("للمالك فقط.", 403);
      if (!d.name || !d.email || String(d.password || "").length < 10) return fail("أدخل الاسم والبريد وكلمة مرور لا تقل عن 10 أحرف.");
      const email = String(d.email).trim().toLowerCase(); if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return fail("البريد مستخدم بالفعل.", 409);
      const slug = slugify(d.slug || "") || `page-${crypto.randomBytes(3).toString("hex")}`; if (db.prepare("SELECT id FROM users WHERE slug=?").get(slug)) return fail("اسم الصفحة مستخدم.", 409);
      const expires = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      const result = db.prepare("INSERT INTO users(name,email,slug,password,bio,expires_at) VALUES(?,?,?,?,?,?)").run(String(d.name).slice(0,80), email, slug, passwordHash(String(d.password)), String(d.bio||"").slice(0,160), expires);
      audit(owner, "customer_created", email, "slug: " + slug);
      return NextResponse.json({ id: Number(result.lastInsertRowid), temporaryPassword: String(d.password) }, { status: 201 });
    }
    return fail("غير موجود.", 404);
  } catch (e) { console.error(e); return fail("تعذر تنفيذ الطلب.", 500); }
}
export async function PUT(req: NextRequest) {
  try {
    const p = parts(req), d = await body(req), user = await current();
    if (p[0] === "account" && p[1] === "password") {
      if (!user) return fail("سجّل الدخول أولًا.", 401);
      if (!passwordMatches(String(d.current || ""), user.password)) return fail("كلمة المرور الحالية غير صحيحة.", 403);
      if (String(d.password || "").length < 10) return fail("كلمة المرور الجديدة 10 أحرف على الأقل.");
      db.prepare("UPDATE users SET password=? WHERE id=?").run(passwordHash(String(d.password)), user.id);
      db.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?").run(user.id, (await cookies()).get(SESSION)?.value || "");
      if (user.admin) audit(user, "admin_password_changed", user.email);
      return NextResponse.json({ ok: true });
    }
    if (p[0] === "profile") {
      if (!user || user.admin) return fail("غير مصرح.", 401);
      const slug = slugify(d.slug); if (!d.name || !slug) return fail("الاسم ومعرّف الصفحة مطلوبان.");
      if (db.prepare("SELECT id FROM users WHERE slug=? AND id<>?").get(slug, user.id)) return fail("معرّف الصفحة مستخدم.", 409);
      const dataImage=(value:any)=>{const s=String(value||'');return s.length<=1400000&&(!s||/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(s))?s:null;};
      const avatar=dataImage(d.avatar),cover=dataImage(d.cover);if(avatar===null||cover===null)return fail("استخدم صورة PNG أو JPG أو WebP أو GIF بحجم مناسب.");
      const images=Array.isArray(d.businessImages)?d.businessImages.slice(0,6).map(dataImage):[];
      if(images.some((x:any)=>x===null))return fail("إحدى صور النشاط غير صالحة أو حجمها كبير.");
      const branches=Array.isArray(d.branches)?d.branches.slice(0,10).map((b:any)=>({name:String(b.name||'').slice(0,80),address:String(b.address||'').slice(0,180),url:String(b.url||'').slice(0,500)})).filter((b:any)=>b.name):[];
      if(branches.some((b:any)=>b.url&&!/^https?:\/\//i.test(b.url)))return fail("رابط موقع الفرع يجب أن يبدأ بـ https:// أو http://.");
      const premiumThemes=['rose','ocean','gold','aurora','editorial','neon','sunset','brutal','botanic'],theme=['lilac','midnight','sand','mint',...premiumThemes].includes(d.theme)?d.theme:'lilac',font=['default','cairo','tajawal'].includes(d.font)?d.font:'default',sheets=String(d.sheetsUrl||'').trim();if(!isPaid(user.id)&&(premiumThemes.includes(theme)||font!=='default'))return fail("القوالب المميزة والخطوط متاحة للمشتركين المدفوعين فقط.",402);if(sheets&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sheets))return fail("رابط Google Sheets غير صالح (يجب أن يكون رابط Apps Script بصيغة /exec).");const accent=/^#[0-9a-fA-F]{6}$/.test(String(d.accent||''))?d.accent:'#7658f5';
      db.prepare("UPDATE users SET name=?,slug=?,bio=?,tagline=?,avatar=?,cover=?,theme=?,accent=?,business_images=?,branches=?,font=?,lead_form=?,lead_title=?,sheets_url=? WHERE id=?").run(String(d.name).slice(0,80),slug,String(d.bio||'').slice(0,500),String(d.tagline||'').slice(0,100),avatar,cover,theme,accent,JSON.stringify(images),JSON.stringify(branches),font,d.leadForm?1:0,String(d.leadTitle||'').slice(0,80),sheets,user.id);
      return NextResponse.json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
    }
    if (p[0] === "links") {
      if (!user || user.admin) return fail("غير مصرح.", 401);
      if (!Array.isArray(d.links) || d.links.length > 30) return fail("الحد الأقصى 30 رابطًا.");
      for (const l of d.links) if (!String(l.title||"").trim() || !validUrl(l.url)) return fail("راجع أسماء الروابط وعناوينها.");
      db.exec("BEGIN");
      try {
        const existing = db.prepare("SELECT id FROM links WHERE user_id=? AND deleted=0").all(user.id).map((x: any) => x.id);
        const keep = new Set<number>();
        const update = db.prepare("UPDATE links SET title=?,url=?,position=?,active=?,icon_key=?,icon_url=?,starts_at=?,ends_at=?,kind=?,extra=?,deleted=0 WHERE id=? AND user_id=?");
        const insert = db.prepare("INSERT INTO links(user_id,title,url,position,active,icon_key,icon_url,starts_at,ends_at,kind,extra) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
        d.links.forEach((l: any, i: number) => { if(!validDate(l.startsAt)||!validDate(l.endsAt))throw new Error('تاريخ غير صالح.');const kd=['link','youtube','pdf','booking','countdown'].includes(l.kind)?l.kind:'link',ex=String(l.extra||'').slice(0,40),sd=String(l.startsAt||''),ed=String(l.endsAt||''),iconKey=String(l.iconKey||'auto').slice(0,30),iconUrl=String(l.iconUrl||'').slice(0,1400000); if(iconUrl&&!(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(iconUrl)||/^https?:\/\/[^\s]+$/i.test(iconUrl)))throw new Error('أيقونة الرابط غير صالحة.'); if (Number.isInteger(l.id) && existing.includes(l.id)) { keep.add(l.id); update.run(String(l.title).slice(0,60), String(l.url).slice(0,500), i, l.active === false ? 0 : 1, iconKey, iconUrl, sd, ed, kd, ex, l.id, user.id); } else insert.run(user.id, String(l.title).slice(0,60), String(l.url).slice(0,500), i, l.active === false ? 0 : 1, iconKey, iconUrl, sd, ed, kd, ex); });
        for (const id of existing) if (!keep.has(id)) db.prepare("UPDATE links SET deleted=1,active=0 WHERE id=? AND user_id=?").run(id,user.id);
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return NextResponse.json({ links: getLinks(user.id) });
    }
    if (p[0] === "admin" && p[1] === "customers" && p[2] && p[3] === "theme") {
      if (!user?.admin) return fail("للمالك فقط.", 403);
      const tt = db.prepare("SELECT * FROM users WHERE id=?").get(Number(p[2])) as any;
      const allowed = ['lilac','midnight','sand','mint','rose','ocean','gold','aurora','editorial','neon','sunset','brutal','botanic'];
      if (!tt || tt.email === adminEmail || !allowed.includes(d.theme)) return fail("بيانات غير صحيحة.");
      db.prepare("UPDATE users SET theme=? WHERE id=?").run(d.theme, tt.id);
      audit(user, "template_changed", tt.name, "القالب: " + d.theme);
      return NextResponse.json({ ok: true });
    }
    if (p[0] === "admin" && p[1] === "customers" && p[2] && p[3] === "status") {
      if (!user?.admin) return fail("للمالك فقط.", 403);
      const target = db.prepare("SELECT * FROM users WHERE id=?").get(Number(p[2])) as any;
      if (!target || target.email === adminEmail) return fail("العميل غير موجود.", 404);
      db.prepare("UPDATE users SET active=?,expires_at=CASE WHEN ?=1 AND expires_at<date('now') THEN date('now','+30 day') ELSE expires_at END WHERE id=?").run(d.active?1:0,d.active?1:0,target.id);
      audit(user, d.active ? "account_activated" : "account_suspended", target.name, target.email);
      return NextResponse.json({ active: !!d.active });
    }
    return fail("غير موجود.", 404);
  } catch (e) { console.error(e); return fail("تعذر حفظ التغييرات.", 500); }
}
