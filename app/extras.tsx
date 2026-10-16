"use client";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Bell, Search, X } from "lucide-react";
export async function xapi(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "تعذر إكمال الطلب");
  return d;
}
export function XModal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="modal-card"><button className="modal-close" onClick={close}>×</button><h2>{title}</h2>{children}</section></div>;
}
const when = (s: string) => { try { return new Date(s.replace(" ", "T") + "Z").toLocaleString("ar-EG"); } catch { return s; } };
const ACTIONS: Record<string, string> = { payment_approved: "قبول طلب دفع", payment_rejected: "رفض طلب دفع", account_suspended: "إيقاف حساب", account_activated: "تفعيل / تجديد حساب", customer_created: "إنشاء حساب عميل", template_changed: "تغيير قالب صفحة", admin_login: "دخول المالك", admin_password_changed: "تغيير كلمة مرور المالك" };

export function PasswordForm() {
  const [cur, setCur] = useState(""), [pw, setPw] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setMsg(""); try { await xapi("/api/account/password", "PUT", { current: cur, password: pw }); setOk(true); setMsg("تم تغيير كلمة المرور."); setCur(""); setPw(""); } catch (x: any) { setOk(false); setMsg(x.message); } };
  return <form onSubmit={submit} className="x-form"><h4>تغيير كلمة المرور</h4><label>الحالية<input type="password" value={cur} onChange={e => setCur(e.target.value)} required autoComplete="current-password" /></label><label>الجديدة (10 أحرف على الأقل)<input type="password" minLength={10} value={pw} onChange={e => setPw(e.target.value)} required autoComplete="new-password" /></label>{msg && <p className={ok ? "x-ok" : "form-error"}>{msg}</p>}<button className="btn btn-primary" type="submit">حفظ كلمة المرور</button></form>;
}

export function AccountMenu({ user, admin, close, onLogout, onHelp, onSettings }: { user: any; admin?: boolean; close: () => void; onLogout: () => void; onHelp: () => void; onSettings?: () => void }) {
  return <XModal title="حسابي" close={close}><p><b>{user?.name}</b><br /><small dir="ltr">{user?.email}</small></p><div className="x-actions">{onSettings && <button className="btn btn-outline" onClick={() => { close(); onSettings(); }}>{admin ? "الإعدادات" : "تصميم صفحتي"}</button>}<button className="btn btn-outline" onClick={() => { close(); onHelp(); }}>المساعدة</button><button className="btn btn-outline" onClick={onLogout}>تسجيل الخروج</button></div><details><summary>تغيير كلمة المرور</summary><PasswordForm /></details></XModal>;
}

export function buildNotices(user: any, billing: any, stats: any, links: any[]) {
  const out: { tone: "warn" | "ok" | "info"; title: string; text: string }[] = [];
  if (user) {
    const days = Math.ceil((Date.parse(user.expiresAt + "T23:59:59Z") - Date.now()) / 864e5);
    if (!user.active) out.push({ tone: "warn", title: "اشتراكك منتهي", text: "صفحتك العامة مخفية. ادفع عبر فودافون كاش لإعادة تفعيلها." });
    else if (days <= 7) out.push({ tone: "warn", title: `ينتهي اشتراكك بعد ${days} يوم`, text: "جدّد قبل الانتهاء حتى لا تختفي صفحتك." });
    else out.push({ tone: "info", title: "اشتراكك ساري", text: `ينتهي في ${user.expiresAt}.` });
  }
  const r = billing?.request;
  if (r?.status === "pending") out.push({ tone: "info", title: "طلب الدفع قيد المراجعة", text: "سنفعّل اشتراكك بعد مراجعة التحويل." });
  if (r?.status === "approved") out.push({ tone: "ok", title: "تم تفعيل اشتراكك", text: "شكراً لك! مميزات البريميوم متاحة الآن." });
  if (r?.status === "rejected") out.push({ tone: "warn", title: "تم رفض طلب الدفع", text: "راجع بيانات التحويل وأرسل طلباً جديداً." });
  if (stats?.leads > 0) out.push({ tone: "ok", title: `${stats.leads} رسالة/بيان تواصل`, text: "راجع قسم «بيانات العملاء المحتملين» أسفل لوحتك." });
  if (!links?.length) out.push({ tone: "warn", title: "لا توجد روابط", text: "أضف أول رابط لتظهر صفحتك للزوار." });
  return out;
}
export function NotificationsModal({ items, close }: { items: ReturnType<typeof buildNotices>; close: () => void }) {
  return <XModal title="الإشعارات" close={close}><div className="x-notes">{items.map((n, i) => <div key={i} className={"x-note x-" + n.tone}><b>{n.title}</b><small>{n.text}</small></div>)}</div></XModal>;
}

function Bars({ title, rows, label }: { title: string; rows: { k: string; n: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return <div className="adv-card"><h4>{title}</h4>{rows.length ? rows.map(r => <div className="adv-row" key={r.k}><span>{label(r.k)}</span><i><b style={{ width: (r.n / max) * 100 + "%" }} /></i><em>{r.n}</em></div>) : <p className="adv-empty">لا توجد بيانات بعد.</p>}</div>;
}
const SRC: Record<string, string> = { qr: "كود QR", instagram: "إنستجرام", whatsapp: "واتساب", facebook: "فيسبوك", tiktok: "تيك توك", twitter: "X / تويتر", telegram: "تيليجرام", youtube: "يوتيوب", direct: "مباشر", other: "مواقع أخرى", unknown: "غير معروف" };
const DEV: Record<string, string> = { mobile: "موبايل", desktop: "كمبيوتر", tablet: "تابلت", unknown: "غير معروف" };
const country = (c: string) => { if (c === "unknown") return "غير معروف"; try { return new Intl.DisplayNames(["ar"], { type: "region" }).of(c) || c; } catch { return c; } };
export function AnalyticsPanel({ stats, user }: { stats: any; user: any }) {
  const off = new Date().getTimezoneOffset() / 60;
  const hours = (stats?.byHour || []).map((x: any) => ({ k: String(((x.h - off) % 24 + 24) % 24), n: x.n })).sort((a: any, b: any) => b.n - a.n).slice(0, 5);
  const best = (stats?.top || [])[0];
  const topSrc = (stats?.bySource || [])[0];
  const report = `تقرير وصلة — ${user?.name}\nالزيارات: ${stats?.visits || 0}\nالضغطات: ${stats?.clicks || 0}\nأفضل رابط: ${best && best.clicks ? best.title + " (" + best.clicks + ")" : "—"}\nأهم مصدر: ${topSrc ? SRC[topSrc.k] || topSrc.k : "—"}\nأكثر ساعة نشاطاً: ${hours[0] ? hours[0].k + ":00" : "—"}`;
  return <article className="panel adv-panel" id="analytics-adv"><div className="panel-head"><div><h3>تحليلات متقدمة</h3><p>مصدر الزيارة والجهاز والدولة وأوقات الذروة</p></div></div>
    <div className="adv-grid"><Bars title="مصدر الزيارة" rows={stats?.bySource || []} label={k => SRC[k] || k} /><Bars title="الجهاز" rows={stats?.byDevice || []} label={k => DEV[k] || k} /><Bars title="الدولة" rows={stats?.byCountry || []} label={country} /><Bars title="أوقات الذروة" rows={hours} label={k => k + ":00"} /></div>
    <div className="adv-best"><b>أفضل رابط:</b> {best && best.clicks ? `${best.title} — ${best.clicks} ضغطة` : "لا توجد ضغطات بعد"}</div>
    <div className="x-actions"><a className="btn btn-outline" target="_blank" rel="noreferrer" href={"https://wa.me/?text=" + encodeURIComponent(report)}>إرسال التقرير عبر واتساب</a><a className="btn btn-outline" href={"mailto:" + (user?.email || "") + "?subject=" + encodeURIComponent("تقرير وصلة الأسبوعي") + "&body=" + encodeURIComponent(report)}>إرسال التقرير بالإيميل</a></div></article>;
}

export function LeadsPanel({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { xapi("/api/leads").then(d => setRows(d.leads || [])).catch(() => {}); }, []);
  return <article className="panel adv-panel" id="leads"><div className="panel-head"><div><h3>بيانات العملاء المحتملين</h3><p>{enabled ? "نموذج التواصل ظاهر في صفحتك العامة." : "فعّل «نموذج جمع البيانات» من «صمّم صفحتك»."}</p></div><a className="btn btn-outline" href="/api/leads.csv">تصدير Excel (CSV)</a></div>
    {rows.length ? <div className="x-table">{rows.map(r => <div key={r.id}><b>{r.name || "—"}</b><span dir="ltr">{r.contact}</span><small>{r.message}</small><em>{when(r.created_at)}</em></div>)}</div> : <p className="adv-empty">لا توجد بيانات بعد.</p>}</article>;
}

export function ReportsPanel({ refreshKey }: { refreshKey: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { xapi("/api/admin/summary").then(setD).catch(() => {}); }, [refreshKey]);
  if (!d) return null;
  const st = { active: d.totals.active, stopped: d.totals.customers - d.totals.active };
  return <div className="reports-extra"><article className="panel adv-panel"><div className="panel-head"><div><h3>تقرير الإيرادات</h3><p>الطلبات المعتمدة خلال آخر ٦ أشهر (جنيه)</p></div></div><Bars title="الإيراد الشهري" rows={(d.revenueMonthly || []).map((m: any) => ({ k: m.label, n: m.count }))} label={k => k} /></article>
    <div className="adv-grid"><Bars title="حالة الحسابات" rows={[{ k: "نشط", n: st.active }, { k: "موقوف / منتهي", n: st.stopped }]} label={k => k} /><Bars title="أكثر الصفحات زيارة" rows={(d.topPages || []).map((p: any) => ({ k: p.name, n: p.visits }))} label={k => k} /></div>
    <article className="panel adv-panel"><div className="panel-head"><div><h3>سجل النشاط (Audit Log)</h3><p>آخر العمليات الإدارية</p></div></div>{d.audit?.length ? <div className="x-table">{d.audit.map((a: any) => <div key={a.id}><b>{ACTIONS[a.action] || a.action}</b><span>{a.target}</span><small>{a.details} — بواسطة {a.actor}</small><em>{when(a.created_at)}</em></div>)}</div> : <p className="adv-empty">لا توجد عمليات مسجلة.</p>}</article></div>;
}

export function youtubeId(url: string) { const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(url || ""); return m ? m[1] : ""; }
export function YouTube({ url, title }: { url: string; title: string }) {
  return <div className="rich-video"><iframe src={"https://www.youtube-nocookie.com/embed/" + youtubeId(url)} title={title} loading="lazy" allowFullScreen /></div>;
}
export function CountdownCard({ l, href }: { l: any; href: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = new Date(l.extra).getTime() - now, ended = !(diff > 0);
  const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return <a className="rich-countdown" href={href}><b>{l.title}</b>{ended ? <span>انتهى العرض</span> : <span dir="ltr">{p(diff / 864e5)}:{p((diff / 36e5) % 24)}:{p((diff / 6e4) % 60)}:{p((diff / 1e3) % 60)}</span>}<small>أيام : ساعات : دقائق : ثوانٍ</small></a>;
}
export function LeadForm({ slug, title }: { slug: string; title?: string }) {
  const [name, setName] = useState(""), [contact, setContact] = useState(""), [message, setMessage] = useState(""), [msg, setMsg] = useState(""), [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setMsg(""); try { await xapi("/api/lead/" + encodeURIComponent(slug), "POST", { name, contact, message }); setDone(true); } catch (x: any) { setMsg(x.message); } };
  if (done) return <section className="public-lead"><h2>شكراً لك!</h2><p>وصلت رسالتك وسنتواصل معك قريباً.</p></section>;
  return <form className="public-lead" onSubmit={submit}><h2>{title || "تواصل معنا"}</h2><input placeholder="الاسم" value={name} maxLength={80} onChange={e => setName(e.target.value)} /><input placeholder="الإيميل أو رقم الهاتف" value={contact} maxLength={120} onChange={e => setContact(e.target.value)} required /><textarea placeholder="رسالتك (اختياري)" value={message} maxLength={500} onChange={e => setMessage(e.target.value)} />{msg && <p className="form-error">{msg}</p>}<button type="submit">إرسال</button></form>;
}

export type PillItem = { key: string; label: string; icon: ReactNode; onClick?: () => void; href?: string; active?: boolean; primary?: boolean };
export type PillBell = { count: number; title?: string; empty?: string; items: { title: string; text?: string; tone?: string }[] };
/* Stretching glass pill: icons expand to show their label, search morphs the bar into an input, the bell slides a panel out of the bar. */
export function NavPill({ items, className = "", search, bell }: { items: PillItem[]; className?: string; search?: { placeholder?: string; onChange: (q: string) => void }; bell?: PillBell }) {
  const [mode, setMode] = useState<"nav" | "search">("nav"), [open, setOpen] = useState(false), [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const to = (next: "nav" | "search") => {
    const el = pill.current, box = inner.current;
    setOpen(false);
    if (!el || !box) { setMode(next); return; }
    el.style.width = el.getBoundingClientRect().width + "px";
    setMode(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.width = (next === "search" ? Math.min(window.innerWidth * 0.92, 420) : box.offsetWidth + 14) + "px";
      if (next === "nav") setTimeout(() => { el.style.width = ""; }, 560); else setTimeout(() => input.current?.focus(), 320);
    }));
  };
  const closeSearch = () => { setQ(""); search?.onChange(""); to("nav"); };
  useEffect(() => {
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); if (mode === "search") closeSearch(); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  });
  const cls = (it: PillItem) => "pill-item" + (it.active ? " on" : "") + (it.primary ? " primary" : "");
  return <div className={"pill-wrap " + className} ref={wrap}>
    <div className={"nav-pill" + (mode === "search" ? " is-search" : "")} ref={pill}>
      <div className="pill-items" ref={inner}>
        {items.map(it => it.href
          ? <a key={it.key} className={cls(it)} href={it.href} aria-label={it.label} onClick={it.onClick}>{it.icon}<span>{it.label}</span></a>
          : <button key={it.key} type="button" className={cls(it)} aria-label={it.label} onClick={it.onClick}>{it.icon}<span>{it.label}</span></button>)}
        {search && <button type="button" className="pill-item" aria-label="بحث" onClick={() => to("search")}><Search size={18} /><span>بحث</span></button>}
        {bell && <button type="button" className={"pill-item" + (open ? " on" : "")} aria-label="الإشعارات" onClick={() => setOpen(o => !o)}><Bell size={18} />{bell.count > 0 && <i className="pill-badge">{bell.count > 9 ? "9+" : bell.count}</i>}<span>الإشعارات</span></button>}
      </div>
      {search && <div className="pill-search"><Search size={18} /><input ref={input} value={q} placeholder={search.placeholder || "ابحث…"} onChange={e => { setQ(e.target.value); search.onChange(e.target.value); }} /><button type="button" aria-label="إغلاق البحث" onClick={closeSearch}><X size={15} /></button></div>}
    </div>
    {bell && <div className={"pill-panel" + (open ? " show" : "")} aria-hidden={!open}><h5>{bell.title || "الإشعارات"}</h5>{bell.items.length ? bell.items.map((n, i) => <div key={i} className={"pill-note " + (n.tone || "")}><b>{n.title}</b>{n.text && <small>{n.text}</small>}</div>) : <p className="pill-empty">{bell.empty || "لا توجد إشعارات جديدة."}</p>}</div>}
  </div>;
}

export const TEMPLATES: { key: string; name: string; premium?: boolean; tag: string }[] = [
  { key: "lilac", name: "ليلكي هادئ", tag: "مجاني" }, { key: "midnight", name: "داكن أنيق", tag: "مجاني" }, { key: "sand", name: "رملي دافئ", tag: "مجاني" }, { key: "mint", name: "أخضر منعش", tag: "مجاني" },
  { key: "aurora", name: "أورورا", premium: true, tag: "زجاجي بخلفية متحركة" }, { key: "editorial", name: "مجلة", premium: true, tag: "ورقي بخط أميري" },
  { key: "neon", name: "نيون", premium: true, tag: "إضاءة مستقبلية" }, { key: "sunset", name: "غروب", premium: true, tag: "تدرّج دافئ زجاجي" },
  { key: "brutal", name: "جريء", premium: true, tag: "ألوان وحدود قوية" }, { key: "botanic", name: "نباتي", premium: true, tag: "ناعم وعضوي" },
  { key: "rose", name: "وردي", premium: true, tag: "ناعم" }, { key: "ocean", name: "محيطي", premium: true, tag: "هادئ" }, { key: "gold", name: "ذهبي فاخر", premium: true, tag: "داكن وذهبي" },
];
function Mini({ k }: { k: string }) { return <div className={"tpl-mini t-" + k}><div className="tpl-cardbox"><span className="tpl-av" /><span className="tpl-t" /><span className="tpl-l" /><span className="tpl-l" /><span className="tpl-l" /></div></div>; }
export function TemplatePicker({ value, onChange, paid }: { value: string; onChange: (k: string) => void; paid: boolean }) {
  return <div><b style={{ fontSize: 13 }}>القالب</b><div className="tpl-grid" role="radiogroup">{TEMPLATES.map(t => <button type="button" role="radio" aria-checked={value === t.key} key={t.key} className={"tpl-btn" + (value === t.key ? " sel" : "")} onClick={() => onChange(t.key)}><Mini k={t.key} /><span className="tpl-name">{t.name}{t.premium && " 👑"}</span><span className={"tpl-tag" + (t.premium ? " pro" : "")}>{t.tag}</span></button>)}</div>{!paid && <p className="tpl-note">👑 القوالب المميزة تظهر لك للمعاينة، ويتم تطبيقها بعد تفعيل الاشتراك المدفوع.</p>}</div>;
}
export function TemplateGallery() {
  return <div className="tpl-showcase"><div className="tpl-grid">{TEMPLATES.map(t => <div className="tpl-btn" key={t.key}><Mini k={t.key} /><span className="tpl-name">{t.name}{t.premium && " 👑"}</span><span className="tpl-tag">{t.tag}</span></div>)}</div></div>;
}
