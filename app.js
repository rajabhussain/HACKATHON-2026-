/* ===== DATA LAYER (browser localStorage) ===== */
const KEY = 'hcm_lite_v1'; let DB = JSON.parse(localStorage.getItem(KEY) || 'null');
const save = () => localStorage.setItem(KEY, JSON.stringify(DB));
const pad = n => String(n).padStart(2, '0'), ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const mins = t => { const [h, m] = t.split(':'); return +h * 60 + +m };
const bad = m => { throw new Error(m) };
const hash = s => { let a = 3735928559, b = 1103547991; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677) } a = Math.imul(a ^ a >>> 16, 2246822507) ^ Math.imul(b ^ b >>> 13, 3266489909); b = Math.imul(b ^ b >>> 16, 2246822507) ^ Math.imul(a ^ a >>> 13, 3266489909); return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36) };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00'));
const daysBetween = (a, b) => { const r = []; for (let d = new Date(a + 'T00:00'); ymd(d) <= b; d.setDate(d.getDate() + 1))r.push(ymd(d)); return r };
const hols = () => new Set(DB.holidays.map(h => h.date));
const isWork = (d, h) => { const w = new Date(d + 'T00:00').getDay(); return w !== 0 && w !== 6 && !h.has(d) };
const workDays = (a, b) => { const h = hols(); return daysBetween(a, b).filter(d => isWork(d, h)) };
const U = () => DB && DB.users.find(u => u.id === +sessionStorage.getItem('uid'));
const need = (...r) => { const u = U(); if (!u) bad('Please sign in'); if (u.must && !r.includes('any')) bad('Change your password first'); if (!r.includes('any') && !r.includes(u.role)) bad('You do not have access to this'); return u };
const audit = (a, e, b, af) => { const u = U(); DB.audit.unshift({ ts: new Date().toISOString(), actor: u ? u.email : 'system', action: a, entity: e, before: JSON.stringify(b ?? null), after: JSON.stringify(af ?? null) }) };
const notify = (uid, t) => DB.notes.unshift({ id: DB.seq++, uid, text: t, read: 0, ts: new Date().toISOString() });
const notifyRole = (r, t) => DB.users.filter(u => u.role === r && u.active).forEach(u => notify(u.id, t));
const req = (o, ks) => ks.forEach(k => { if (o[k] === undefined || o[k] === null || o[k] === '') bad(k + ' is required') });
const empOf = u => DB.emps.find(e => e.id === u.emp);
const dn = () => Object.fromEntries(DB.depts.map(d => [d.id, d.name]));
const monthStart = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)) };
const rng = q => ({ from: q.from || monthStart(), to: q.to || ymd() });
const st = () => DB.settings;

function attStats(from, to, emps) {
    const t = ymd(), end = to < t ? to : t, out = []; if (end < from) return out; const h = hols();
    for (const e of emps) {
        const f = e.join > from ? e.join : from, t2 = e.exit && e.exit < end ? e.exit : end;
        for (const d of daysBetween(f, t2)) {
            if (!isWork(d, h)) continue; const a = DB.att.find(x => x.emp === e.id && x.date === d), l = DB.leaves.find(x => x.emp === e.id && x.status === 'approved' && x.sd <= d && x.ed >= d); let s;
            if (a) s = (!a.out && d < t) ? 'missing_checkout' : a.status; else if (l) s = 'on_leave'; else if (d < t) s = 'absent'; else continue;
            out.push({ emp_id: e.id, name: e.name, dept_id: e.dept, date: d, status: s, lt: l && l.type })
        }
    } return out
}
function tally(l) {
    const c = { present: 0, late: 0, half_day: 0, missing_checkout: 0, absent: 0, on_leave: 0 }; l.forEach(x => c[x.status] = (c[x.status] || 0) + 1); const den = l.length - c.on_leave;
    c.rate = den ? +(((c.present + c.late + c.missing_checkout + .5 * c.half_day) / den) * 100).toFixed(1) : 0; c.late_pct = c.present + c.late ? +(c.late / (c.present + c.late) * 100).toFixed(1) : 0; return c
}
const lateTop = (l, n = 5) => Object.entries(l.filter(x => x.status === 'late').reduce((a, x) => (a[x.name] = (a[x.name] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, late_days]) => ({ name, late_days }));
const scope = (u, dept) => u.role === 'employee' ? [empOf(u)] : DB.emps.filter(e => ['active', 'probation'].includes(e.status) && (!dept || e.dept == dept));
const statusFor = (ci, co) => { const s = st(); if (co && (mins(co) - mins(ci)) / 60 < +s.halfday) return 'half_day'; return mins(ci) > mins(s.start) + +s.grace ? 'late' : 'present' };
function balance(eid, year = new Date().getFullYear()) {
    return Object.entries(DB.leaveTypes).map(([type, quota]) => {
        const q = s => DB.leaves.filter(l => l.emp === eid && l.type === type && l.status === s && l.sd.startsWith(year)).reduce((a, l) => a + l.days, 0);
        const used = q('approved'), pending = q('pending'); return { type, quota, used, pending, left: type === 'unpaid' ? null : quota - used }
    })
}
const taxAnnual = g => g <= 6e5 ? 0 : g <= 1.2e6 ? (g - 6e5) * .05 : g <= 2.4e6 ? 3e4 + (g - 1.2e6) * .15 : g <= 3.6e6 ? 21e4 + (g - 2.4e6) * .25 : 51e4 + (g - 3.6e6) * .35;
const r2 = n => Math.round(n * 100) / 100;
const POLICY = `Company rules: office starts ${'09:00'} with a 15 minute grace (late after 09:15). Under 5 working hours = half day. No record and no approved leave = absent. No check-out = missing check-out. Weekend is Saturday and Sunday. Leave counts working days only (weekends and holidays are skipped). Yearly quotas: annual 14, sick 8, casual 10, unpaid unlimited. Overlapping or over-balance requests are rejected. Payroll: gross = 1.5 x basic; per-day = gross / working days; deductions for absent days, unpaid leave and 0.5 x half days; joiners and leavers are prorated; tax by slab on annual gross; Admin finalizes and locks the month.`;

/* ===== SERVICES (every call checks the signed-in user's role + scope) ===== */
const S = {
    isSetup: () => !!DB && DB.users.length > 0,
    setup(company, email, pw) {
        if (S.isSetup()) bad('Already set up'); req({ company, email, pw }, ['company', 'email', 'pw']); if (pw.length < 6) bad('Password needs 6+ characters');
        DB = {
            seq: 100, settings: { company, start: '09:00', grace: 15, halfday: 5, lat: '', lng: '', radius: 150 }, users: [{ id: 1, name: 'Admin', email: email.toLowerCase(), hash: hash(pw), role: 'admin', active: 1, must: 0 }], depts: [], desigs: [], holidays: [],
            leaveTypes: { annual: 14, sick: 8, casual: 10, unpaid: 0 }, emps: [], att: [], corr: [], leaves: [], runs: {}, slips: [], ann: [], notes: [], audit: []
        }; audit('setup', 'company', null, { company, email }); save()
    },
    login(email, pw) { const u = DB && DB.users.find(x => x.email === (email || '').toLowerCase()); if (!u || !u.active || u.hash !== hash(pw || '')) bad('Wrong email or password'); sessionStorage.setItem('uid', u.id) },
    logout: () => sessionStorage.removeItem('uid'),
    changePw(p) { const u = need('any'); if ((p || '').length < 6) bad('Password needs 6+ characters'); u.hash = hash(p); u.must = 0; audit('change_password', 'user', null, { id: u.id }); save() },
    me() { const u = need('any'), e = u.emp ? empOf(u) : null; return { ...u, company: st().company, employee: e && { ...e, dept_name: dn()[e.dept], desig_name: (DB.desigs.find(d => d.id == e.desig) || {}).name } } },
    master: () => { need('any'); return { depts: DB.depts, desigs: DB.desigs, holidays: [...DB.holidays].sort((a, b) => a.date < b.date ? -1 : 1), leaveTypes: DB.leaveTypes } },
    addMaster(kind, o) {
        need('admin'); if (kind === 'depts' || kind === 'desigs') { req(o, ['name']); if (DB[kind].some(x => x.name.toLowerCase() === o.name.toLowerCase())) bad('Already exists'); DB[kind].push({ id: DB.seq++, name: o.name }) }
        else if (kind === 'holidays') { req(o, ['date', 'name']); if (!isDate(o.date)) bad('Date must be YYYY-MM-DD'); if (DB.holidays.some(h => h.date === o.date)) bad('Already exists'); DB.holidays.push({ date: o.date, name: o.name }) }
        else if (kind === 'leaveTypes') { req(o, ['name', 'quota']); if (!(+o.quota >= 0)) bad('Quota must be 0 or more'); DB.leaveTypes[o.name.toLowerCase()] = +o.quota } else bad('Unknown list'); audit('create', kind, null, o); save()
    },
    settings: () => { need('admin', 'hr'); return st() },
    saveSettings(o) { need('admin'); const b = { ...st() };['company', 'start', 'grace', 'halfday', 'radius', 'lat', 'lng'].forEach(k => { if (o[k] !== undefined) DB.settings[k] = o[k] }); if (!/^\d\d:\d\d$/.test(st().start)) bad('Start time must be HH:MM'); audit('update', 'settings', b, st()); save() },
    users: () => { need('admin'); return DB.users },
    addHR(o) {
        need('admin'); req(o, ['name', 'email', 'password']); if (o.password.length < 6) bad('Password needs 6+ characters'); if (DB.users.some(u => u.email === o.email.toLowerCase())) bad('Email already used');
        DB.users.push({ id: DB.seq++, name: o.name, email: o.email.toLowerCase(), hash: hash(o.password), role: 'hr', active: 1, must: 1 }); audit('create', 'hr_user', null, { email: o.email }); save()
    },
    toggleUser(id) { need('admin'); const u = DB.users.find(x => x.id == id); if (!u || u.role === 'admin') bad('User not found'); u.active = u.active ? 0 : 1; audit(u.active ? 'activate' : 'deactivate', 'user', null, { id }); save() },
    resetUser(id, p) { need('admin'); if ((p || '').length < 6) bad('Password needs 6+ characters'); const u = DB.users.find(x => x.id == id); if (!u || u.role === 'admin') bad('User not found'); u.hash = hash(p); u.must = 1; audit('reset_password', 'user', null, { id }); save() },
    empCreate(b) {
        need('hr'); req(b, ['code', 'name', 'email', 'dept', 'join', 'basic']); if (!/^\S+@\S+\.\S+$/.test(b.email)) bad('Invalid email'); if (!isDate(b.join)) bad('Join date must be YYYY-MM-DD'); if (!(+b.basic > 0)) bad('Salary must be above 0');
        if (!DB.depts.some(d => d.id == b.dept)) bad('Unknown department'); if (DB.emps.some(e => e.code === b.code || e.email === b.email.toLowerCase()) || DB.users.some(u => u.email === b.email.toLowerCase())) bad('Code or email already exists');
        const temp = Math.random().toString(36).slice(2, 9) + 'A1', id = DB.seq++, uid = DB.seq++;
        DB.emps.push({ id, code: b.code, name: b.name, email: b.email.toLowerCase(), phone: b.phone || '', address: '', dept: +b.dept, desig: b.desig ? +b.desig : null, join: b.join, exit: null, status: 'active', basic: +b.basic });
        DB.users.push({ id: uid, name: b.name, email: b.email.toLowerCase(), hash: hash(temp), role: 'employee', emp: id, active: 1, must: 1 }); audit('create', 'employee', null, { id, code: b.code }); save(); return temp
    },
    empList(q, dept) { const u = need('admin', 'hr'); let r = DB.emps.map(e => ({ ...e, dept_name: dn()[e.dept], desig_name: (DB.desigs.find(d => d.id == e.desig) || {}).name })); if (dept) r = r.filter(e => e.dept == dept); if (q) r = r.filter(e => (e.name + e.code + e.email).toLowerCase().includes(q.toLowerCase())); return r },
    empGet(id) {
        const u = need('admin', 'hr', 'employee'); if (u.role === 'employee' && u.emp != id) bad('You can only see your own record'); const e = DB.emps.find(x => x.id == id); if (!e) bad('Not found'); const m = rng({});
        return { ...e, dept_name: dn()[e.dept], balance: balance(e.id), att: tally(attStats(m.from, m.to, [e])) }
    },
    empUpdate(id, o) {
        const u = need('hr'), e = DB.emps.find(x => x.id == id); if (!e) bad('Not found'); if (o.basic !== undefined && !(+o.basic > 0)) bad('Salary must be above 0'); const b = {};
        ['name', 'phone', 'address', 'dept', 'desig', 'basic', 'status', 'exit'].forEach(k => { if (o[k] !== undefined) { b[k] = e[k]; e[k] = k === 'basic' ? +o.basic : o[k] } });
        if (o.status === 'exited') { const x = DB.users.find(z => z.emp === e.id); if (x) x.active = 0 } audit('update', 'employee', b, o); save()
    },
    saveContact(o) { const u = need('employee'), e = empOf(u), b = { phone: e.phone, address: e.address }; e.phone = o.phone || ''; e.address = o.address || ''; audit('update', 'employee', b, o); save() },
    checkin() { const u = need('employee'), d = ymd(), t = hm(); if (DB.att.some(a => a.emp === u.emp && a.date === d)) bad('Already checked in today'); DB.att.push({ emp: u.emp, date: d, in: t, out: null, status: statusFor(t), source: 'web' }); save() },
    checkout() { const u = need('employee'), a = DB.att.find(x => x.emp === u.emp && x.date === ymd()); if (!a) bad('Check in first'); if (a.out) bad('Already checked out'); a.out = hm(); a.status = statusFor(a.in, a.out); save() },
    myAtt(month) {
        const u = need('employee'), e = empOf(u), m = month || ymd().slice(0, 7), f = m + '-01', l = ymd(new Date(+m.slice(0, 4), +m.slice(5), 0)), days = attStats(f, l, [e]);
        return { days: days.map(x => ({ ...x, rec: DB.att.find(a => a.emp === e.id && a.date === x.date) })), summary: tally(days) }
    },
    board(date, dept) { need('admin', 'hr'); const d = date || ymd(); return attStats(d, d, scope(U(), dept)).map(x => ({ ...x, rec: DB.att.find(a => a.emp === x.emp_id && a.date === d) })) },
    corrAdd(b) { const u = need('employee'); req(b, ['date', 'check_in', 'reason']); if (!isDate(b.date) || b.date > ymd()) bad('Pick a past or current date'); DB.corr.unshift({ id: DB.seq++, emp: u.emp, name: u.name, date: b.date, in: b.check_in, out: b.check_out || null, reason: b.reason, status: 'pending', comment: '' }); notifyRole('hr', `${u.name} requested an attendance correction for ${b.date}`); save() },
    corrList() { const u = need('admin', 'hr', 'employee'); return u.role === 'employee' ? DB.corr.filter(c => c.emp === u.emp) : DB.corr },
    corrDecide(id, ap, comment) {
        need('hr'); const c = DB.corr.find(x => x.id == id); if (!c || c.status !== 'pending') bad('Already decided'); c.status = ap ? 'approved' : 'rejected'; c.comment = comment || '';
        if (ap) { DB.att = DB.att.filter(a => !(a.emp === c.emp && a.date === c.date)); DB.att.push({ emp: c.emp, date: c.date, in: c.in, out: c.out, status: statusFor(c.in, c.out), source: 'correction' }) }
        const x = DB.users.find(z => z.emp === c.emp); if (x) notify(x.id, `Your attendance correction for ${c.date} was ${ap ? 'approved' : 'rejected'}`); audit(ap ? 'approve' : 'reject', 'correction', null, { id }); save()
    },
    balance() { const u = need('employee'); return balance(u.emp) },
    leaveApply(b) {
        const u = need('employee'); req(b, ['type', 'start', 'end']); const { type, start, end } = b; if (!isDate(start) || !isDate(end) || end < start) bad('Invalid dates'); const days = workDays(start, end).length; if (!days) bad('No working days in that range (weekends and holidays are skipped)');
        if (!(type in DB.leaveTypes)) bad('Unknown leave type'); if (DB.leaves.some(l => l.emp === u.emp && ['pending', 'approved'].includes(l.status) && l.sd <= end && l.ed >= start)) bad('This overlaps another leave');
        if (type !== 'unpaid') { const x = balance(u.emp, +start.slice(0, 4)).find(y => y.type === type), left = DB.leaveTypes[type] - x.used - x.pending; if (days > left) bad(`Not enough ${type} leave: ${left} day(s) left, ${days} requested`) }
        DB.leaves.unshift({ id: DB.seq++, emp: u.emp, name: u.name, type, sd: start, ed: end, days, reason: b.reason || '', status: 'pending', comment: '' }); notifyRole('hr', `${u.name} applied for ${days} day(s) of ${type} leave`); save(); return days
    },
    leaveList() { const u = need('admin', 'hr', 'employee'); return u.role === 'employee' ? DB.leaves.filter(l => l.emp === u.emp) : DB.leaves },
    leaveCancel(id) { const u = need('employee'), l = DB.leaves.find(x => x.id == id && x.emp === u.emp); if (!l || !['pending', 'approved'].includes(l.status)) bad('Cannot cancel this leave'); l.status = 'cancelled'; save() },
    leaveDecide(id, ap, comment) {
        need('hr'); const l = DB.leaves.find(x => x.id == id); if (!l || l.status !== 'pending') bad('Already decided'); l.status = ap ? 'approved' : 'rejected'; l.comment = comment || '';
        const x = DB.users.find(z => z.emp === l.emp); if (x) notify(x.id, `Your ${l.type} leave (${l.sd} to ${l.ed}) was ${l.status}${comment ? ': ' + comment : ''}`); audit(ap ? 'approve' : 'reject', 'leave', null, { id }); save()
    },
    dash(q = {}) {
        const u = need('admin', 'hr', 'employee');
        if (u.role === 'employee') {
            const e = empOf(u), n = new Date(), wk = new Date(n); wk.setDate(n.getDate() - ((n.getDay() + 6) % 7)); const hrs = DB.att.filter(a => a.emp === e.id && a.date >= ymd(wk) && a.out).reduce((s, a) => s + (mins(a.out) - mins(a.in)) / 60, 0), m = rng({});
            const last = DB.slips.filter(p => p.emp === e.id && DB.runs[p.month] === 'finalized').sort((a, b) => a.month < b.month ? 1 : -1)[0];
            return { hours_week: +hrs.toFixed(1), late_count: tally(attStats(m.from, m.to, [e])).late, balance: balance(e.id), last_payslip: last || null, today: DB.att.find(a => a.emp === e.id && a.date === ymd()) || null }
        }
        const r = rng(q), emps = scope(u, q.dept), l = attStats(r.from, r.to, emps), t = ymd(), today = attStats(t, t, emps), names = dn(), by = (arr, f) => arr.reduce((a, x) => (a[f(x)] = (a[f(x)] || 0) + 1, a), {}), att = tally(l), bd = {};
        Object.keys(names).forEach(id => { const x = l.filter(i => i.dept_id == id); if (x.length) bd[names[id]] = +(x.filter(i => i.status === 'absent').length / x.length * 100).toFixed(1) });
        const byDate = by(l, x => x.date), o = {
            range: r, headcount: emps.length, present_today: today.filter(x => ['present', 'late', 'half_day', 'missing_checkout'].includes(x.status)).length, on_leave_today: today.filter(x => x.status === 'on_leave').length, late_today: today.filter(x => x.status === 'late').length,
            pending_approvals: DB.leaves.filter(x => x.status === 'pending').length + DB.corr.filter(x => x.status === 'pending').length, attendance_rate: att.rate, late_pct: att.late_pct, absenteeism_pct_by_department: bd,
            leave_days_by_type: by(l.filter(x => x.status === 'on_leave'), x => x.lt), top_late_comers: lateTop(l), trend: Object.keys(byDate).sort().map(d => ({ date: d, rate: tally(l.filter(x => x.date === d)).rate })), headcount_by_department: by(emps, x => names[x.dept_id])
        };
        if (u.role === 'admin') {
            const y = new Date().getFullYear(), ex = DB.emps.filter(e => e.exit && e.exit.startsWith(y)).length, lm = Object.keys(DB.runs).sort().pop(), ps = DB.slips.filter(p => p.month === lm);
            Object.assign(o, {
                attrition_ytd_pct: DB.emps.length ? +(ex / DB.emps.length * 100).toFixed(1) : 0, avg_gross_salary: Math.round(emps.reduce((a, e) => a + e.basic * 1.5, 0) / (emps.length || 1)), latest_payroll: lm ? { month: lm, gross: r2(ps.reduce((a, p) => a + p.gross, 0)), net: r2(ps.reduce((a, p) => a + p.net, 0)) } : null,
                payroll_cost_by_department: Object.fromEntries(Object.entries(ps.reduce((a, p) => { const k = names[DB.emps.find(e => e.id === p.emp).dept]; a[k] = (a[k] || 0) + p.gross; return a }, {})).map(([k, v]) => [k, Math.round(v)]))
            })
        }
        return o
    },
    payGet(m) { need('admin', 'hr'); const rows = DB.slips.filter(p => p.month === m).map(p => ({ ...p, name: DB.emps.find(e => e.id === p.emp).name })); return { status: DB.runs[m] || null, rows, gross: r2(rows.reduce((a, x) => a + x.gross, 0)), net: r2(rows.reduce((a, x) => a + x.net, 0)) } },
    payRun(m) {
        need('hr'); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) bad('Month must be YYYY-MM'); if (DB.runs[m] === 'finalized') bad('This month is finalized and locked');
        const [y, mo] = m.split('-').map(Number), first = m + '-01', last = ymd(new Date(y, mo, 0)), wdAll = workDays(first, last).length || 1; DB.slips = DB.slips.filter(p => p.month !== m);
        for (const e of DB.emps) {
            const f = e.join > first ? e.join : first, t = e.exit && e.exit < last ? e.exit : last; if (f > t) continue; const wd = workDays(f, t).length; if (!wd) continue; const full = e.basic * 1.5, gross = full * wd / wdAll, per = full / wdAll, l = attStats(f, t, [e]);
            const absent = l.filter(x => x.status === 'absent').length, unpaid = l.filter(x => x.status === 'on_leave' && x.lt === 'unpaid').length, half = l.filter(x => x.status === 'half_day').length, ded = per * (absent + unpaid + .5 * half), tax = taxAnnual(full * 12) / 12 * wd / wdAll;
            DB.slips.push({ id: DB.seq++, month: m, emp: e.id, working_days: wd, gross: r2(gross), absent, unpaid, half, deduction: r2(ded), tax: r2(tax), net: r2(gross - ded - tax) })
        }
        DB.runs[m] = 'draft'; audit('run', 'payroll', null, { month: m, status: 'draft' }); save()
    },
    payFinalize(m) {
        need('admin'); if (!DB.runs[m]) bad('No draft for this month'); if (DB.runs[m] === 'finalized') bad('Already finalized'); DB.runs[m] = 'finalized';
        DB.slips.filter(p => p.month === m).forEach(p => { const x = DB.users.find(u => u.emp === p.emp); if (x) notify(x.id, `Your payslip for ${m} is ready`) }); audit('finalize', 'payroll', { status: 'draft' }, { month: m, status: 'finalized' }); save()
    },
    slips() { const u = need('admin', 'hr', 'employee'); return DB.slips.filter(p => u.role !== 'employee' || (p.emp === u.emp && DB.runs[p.month] === 'finalized')).map(p => ({ ...p, name: DB.emps.find(e => e.id === p.emp).name, code: DB.emps.find(e => e.id === p.emp).code })).sort((a, b) => a.month < b.month ? 1 : -1) },
    annList: () => { need('any'); return DB.ann },
    annAdd(o) { const u = need('admin', 'hr'); req(o, ['title', 'body']); DB.ann.unshift({ title: o.title, body: o.body, author: u.name, ts: new Date().toISOString() }); DB.users.filter(x => x.active).forEach(x => notify(x.id, 'Announcement: ' + o.title)); audit('create', 'announcement', null, o); save() },
    notes: () => { const u = need('any'); return DB.notes.filter(n => n.uid === u.id) }, readNotes: () => { const u = need('any'); DB.notes.filter(n => n.uid === u.id).forEach(n => n.read = 1); save() },
    audit: () => { need('admin'); return DB.audit.slice(0, 200) },
    exportCsv() { need('hr'); return ['code,name,email,department,join_date,basic,status', ...DB.emps.map(e => [e.code, e.name, e.email, dn()[e.dept], e.join, e.basic, e.status].map(x => `"${x ?? ''}"`).join(','))].join('\n') },
    /* Local assistant: answers from the same services (no internet / no API key) */
    ask(q) {
        const u = need('admin', 'hr', 'employee'), t = q.toLowerCase(), emps = scope(u), d = DB.depts.find(x => t.includes(x.name.toLowerCase())), isEmp = u.role === 'employee', has = re => re.test(t);
        if (has(/salary|tankh?w?ah|pay\b|payroll|wage/)) {
            if (isEmp) { if (has(/\bmy\b|\bmera\b|\bmeri\b/)) { const l = S.dash().last_payslip; return l ? `Your last finalized payslip (${l.month}): net pay ${Math.round(l.net)}. Full details are on the Payslips page.` : 'You have no finalized payslip yet.' } return 'Sorry, I can only share your own salary information, not anyone else’s.' }
            const m = Object.keys(DB.runs).sort().pop(); if (!m) return 'No payroll has been run yet.'; const p = S.payGet(m); return `Payroll ${m} (${p.status}): ${p.rows.length} payslips, gross ${Math.round(p.gross)}, net ${Math.round(p.net)}.`
        }
        if (has(/policy|rule|grace|half.?day|quota|how many leaves are allowed|late after|working hours/)) return POLICY;
        if (isEmp) {
            if (has(/leave|chutti|chhutti|bacha|left|balance|baqi/)) { const b = balance(u.emp).filter(x => x.left !== null); const k = ['sick', 'casual', 'annual'].find(x => t.includes(x)); return (k ? b.filter(x => x.type === k) : b).map(x => `${x.type}: ${x.left} of ${x.quota} days left`).join('; ') }
            if (has(/late|attendance|absent|hazri/)) { const s = S.dash(), m = rng({}), c = tally(attStats(m.from, m.to, emps)); return `This month: attendance rate ${c.rate}%, late ${c.late}, absent ${c.absent}, on leave ${c.on_leave}.` } return 'I can answer about your own leave, attendance and the company policy.'
        }
        if (has(/on leave|leave today|chutti par|chhutti par/)) { const t0 = ymd(), l = attStats(t0, t0, emps).filter(x => x.status === 'on_leave'); return l.length ? `${l.length} on leave today: ${l.map(x => `${x.name} (${x.lt})`).join(', ')}.` : 'Nobody is on leave today.' }
        if (has(/late/)) { const r = rng({}), top = lateTop(attStats(r.from, r.to, scope(u, d && d.id)), 5); return top.length ? `Most late this month: ${top.map(x => `${x.name} (${x.late_days})`).join(', ')}.` : 'Nobody has been late this month.' }
        if (has(/attendance|hazri/)) { const r = rng({}), c = tally(attStats(r.from, r.to, scope(u, d && d.id))); return `Attendance rate ${r.from} to ${r.to}${d ? ' in ' + d.name : ''}: ${c.rate}% (present ${c.present}, late ${c.late}, absent ${c.absent}, on leave ${c.on_leave}).` }
        if (has(/headcount|how many|employees|kitne|active/)) { const e = scope(u, d && d.id); return `${e.length} active employee(s)${d ? ' in ' + d.name : ''}.` }
        if (has(/pending|approval/)) { const x = S.dash(); return `${x.pending_approvals} pending approval(s) (leave and attendance corrections).` }
        return 'I don’t know that yet. Try: who is on leave today, who came late most often, attendance rate, headcount in a department, payroll, or the company policy.'
    },
    smartLeave(text) {
        need('employee'); const t = text.toLowerCase(), now = new Date(), d0 = now.getDay(), dates = [], D = n => { const x = new Date(now); x.setDate(x.getDate() + n); return ymd(x) };
        (t.match(/\d{4}-\d{2}-\d{2}/g) || []).forEach(x => dates.push(x)); if (/tomorrow|\bkal\b/.test(t)) dates.push(D(1)); if (/day after|parso/.test(t)) dates.push(D(2)); if (/\btoday\b|\baaj\b/.test(t)) dates.push(D(0));
        const idx = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }, nextMon = (8 - d0) % 7 || 7; let m; const re = /\b(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday|s)?\b/g;
        while ((m = re.exec(t))) { const w = idx[m[1]]; dates.push(/\bnext\b|\bagle\b/.test(t) ? D(nextMon + ((w + 6) % 7)) : D(((w - d0 + 7) % 7) || 7)) }
        if (!dates.length) bad('Could not find any dates. Please fill in the form.'); dates.sort();
        const type = /sick|ill\b|fever|bimar|doctor|medical/.test(t) ? 'sick' : /vacation|annual|trip|holiday/.test(t) ? 'annual' : 'casual'; return { type, start: dates[0], end: dates[dates.length - 1], reason: text }
    }
};
/* ===== UI ===== */
const $ = s => document.querySelector(s); let CUR = 'dash', ME = null, M = null;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
function toast(m, b) { const t = $('#toast'); t.textContent = m; t.className = b ? 'bad' : ''; t.style.display = 'block'; clearTimeout(t.h); t.h = setTimeout(() => t.style.display = 'none', 3500) }
const table = (cols, rows) => rows.length ? `<div class=tw><table><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<p class=empty>Nothing here yet.</p>';
const tag = s => `<span class="tag ${s}">${esc(String(s).replace('_', ' '))}</span>`;
const kpi = (v, l) => `<div class=kpi><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
const bars = o => { const e = Object.entries(o || {}), mx = Math.max(1, ...e.map(x => x[1])); return e.length ? e.map(([k, v]) => `<div class=bar><span>${esc(k)}</span><i style="width:${v / mx * 60}%"></i><b>${v}</b></div>`).join('') : '<p class=empty>No data in this range yet.</p>' };
const opts = a => a.map(x => [x.id, x.name]);
function form(id, fields, btn) { return `<form id=${id}>${fields.map(([n, l, t, x]) => `<label>${l}${t === 'select' ? `<select name=${n}>${x.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>` : t === 'textarea' ? `<textarea name=${n}></textarea>` : `<input name=${n} type=${t || 'text'} ${x || ''}>`}</label>`).join('')}<button class=btn>${btn}</button></form>` }
const onForm = (id, fn) => { const f = $('#' + id); if (f) f.onsubmit = e => { e.preventDefault(); try { fn(Object.fromEntries(new FormData(f))) } catch (x) { toast(x.message, 1) } } };
const act = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.onclick = () => { try { fn(b.dataset) } catch (x) { toast(x.message, 1) } });
const main = h => $('#main').innerHTML = h, head = t => `<div class=top><h2>${t}</h2></div>`, reload = () => go(CUR);
const dl = (txt, n, type = 'text/csv') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type })); a.download = n; a.click() };
const card = (t, b) => `<div class=login><div class=card><h2 style="margin-bottom:4px">HCM Lite</h2><p class=mut>${t}</p>${b}</div></div>`;
function boot() {
    if (!S.isSetup()) {
        $('#root').innerHTML = card('First-run setup: name your company and create the Admin account.', form('f', [['company', 'Company name', 'text', 'required'], ['email', 'Admin email', 'email', 'required'], ['password', 'Password (6+ characters)', 'password', 'required minlength=6']], 'Create company'));
        return onForm('f', v => { S.setup(v.company, v.email, v.password); toast('Company created. Sign in.'); boot() })
    }
    if (!U()) { $('#root').innerHTML = card('Sign in to continue.', form('f', [['email', 'Email', 'email', 'required'], ['password', 'Password', 'password', 'required']], 'Sign in')); return onForm('f', v => { S.login(v.email, v.password); boot() }) }
    ME = S.me(); if (ME.must) { $('#root').innerHTML = card('Choose a new password before you continue.', form('f', [['password', 'New password (6+ characters)', 'password', 'required minlength=6']], 'Save password')); return onForm('f', v => { S.changePw(v.password); toast('Password changed'); boot() }) }
    shell(); go('dash')
}
const MENU = {
    admin: [['dash', 'Dashboard'], ['setup', 'Company setup'], ['users', 'Logins'], ['emps', 'Employees'], ['att', 'Attendance'], ['leaves', 'Leave'], ['payroll', 'Payroll'], ['ann', 'Announcements'], ['audit', 'Audit log'], ['ai', 'AI assistant']],
    hr: [['dash', 'Dashboard'], ['emps', 'Employees'], ['att', 'Attendance'], ['leaves', 'Leave approvals'], ['payroll', 'Payroll'], ['ann', 'Announcements'], ['ai', 'AI assistant']],
    employee: [['dash', 'My dashboard'], ['profile', 'Profile'], ['att', 'Attendance'], ['leaves', 'Leave'], ['slips', 'Payslips'], ['ann', 'Announcements'], ['ai', 'AI assistant']]
};
function shell() {
    $('#root').innerHTML = `<div class=app><nav><h1>${esc(ME.company)}</h1><small>${esc(ME.name)} · ${ME.role}</small>${MENU[ME.role].map(([k, l]) => `<a data-k=${k} tabindex=0>${l}</a>`).join('')}<a data-k=notes tabindex=0>Notifications ${S.notes().filter(n => !n.read).length ? '•' : ''}</a><a id=out tabindex=0>Sign out</a></nav><main id=main></main></div>`;
    document.querySelectorAll('nav a[data-k]').forEach(a => { a.onclick = () => go(a.dataset.k); a.onkeydown = e => e.key === 'Enter' && go(a.dataset.k) }); $('#out').onclick = () => { S.logout(); boot() }
}
function go(k) {
    CUR = k; document.querySelectorAll('nav a[data-k]').forEach(a => a.classList.toggle('on', a.dataset.k === k));
    try { M = S.master(); V[k]() } catch (e) { main(`<div class=card><h3>Something went wrong</h3><p>${esc(e.message)}</p><button class=btn onclick="go(CUR)">Try again</button></div>`) }
}
const V = {};
const annBlock = () => { const a = S.annList(); return `<div class=card><h3>Announcements</h3>${a.length ? a.slice(0, 3).map(x => `<p><b>${esc(x.title)}</b> <span class=mut>${esc(x.author)}, ${x.ts.slice(0, 10)}</span><br>${esc(x.body)}</p>`).join('') : '<p class=empty>No announcements yet.</p>'}</div>` };
V.dash = () => {
    if (ME.role === 'employee') {
        const d = S.dash(), left = d.balance.filter(b => b.left !== null).reduce((a, b) => a + b.left, 0);
        main(head('My dashboard') + `<div class=kpis>${kpi(d.hours_week + ' h', 'Hours this week (target 40)')}${kpi(d.late_count, 'Late this month')}${kpi(left, 'Leave days left')}${kpi(d.last_payslip ? money(d.last_payslip.net) : '—', 'Last payslip (net)')}</div>
    <div class=card><h3>Today</h3><p>${d.today ? `Checked in at <b>${d.today.in}</b>${d.today.out ? `, out at <b>${d.today.out}</b>` : ''} ${tag(d.today.status)}` : 'You have not checked in yet.'}</p><button class=btn id=ci ${d.today ? 'disabled' : ''}>Check in</button> <button class="btn alt" id=co ${!d.today || d.today.out ? 'disabled' : ''}>Check out</button></div>
    <div class=card><h3>Leave balance</h3>${table([['Type', b => b.type], ['Quota', b => b.quota || 'unlimited'], ['Used', b => b.used], ['Pending', b => b.pending], ['Left', b => b.left ?? '—']], d.balance)}</div>` + annBlock());
        $('#ci').onclick = () => { try { S.checkin(); toast('Checked in'); reload() } catch (e) { toast(e.message, 1) } }; $('#co').onclick = () => { try { S.checkout(); toast('Checked out'); reload() } catch (e) { toast(e.message, 1) } }; return
    }
    const d = S.dash(window.dq || {}), a = ME.role === 'admin';
    main(head(a ? 'Company dashboard' : 'HR dashboard') + `<div class=card>${form('flt', [['from', 'From', 'date', `value=${d.range.from}`], ['to', 'To', 'date', `value=${d.range.to}`], ['dept', 'Department', 'select', [['', 'All'], ...opts(M.depts)]]], 'Apply filters')}</div>
  <div class=kpis>${kpi(d.headcount, 'Headcount')}${kpi(d.present_today, 'Present today')}${kpi(d.on_leave_today, 'On leave today')}${kpi(d.late_today, 'Late today')}${kpi(d.pending_approvals, 'Pending approvals')}${kpi(d.attendance_rate + '%', 'Attendance rate')}
  ${a ? kpi(d.attrition_ytd_pct + '%', 'Attrition YTD') + kpi(money(d.avg_gross_salary), 'Average gross salary') + kpi(d.latest_payroll ? money(d.latest_payroll.gross) : '—', 'Latest payroll cost') : ''}</div>
  <div class=card><button class="btn alt" id=sum>Summarize</button><div id=sumout></div></div>
  <div class=grid2><div class=card><h3>Attendance trend (%)</h3>${bars(Object.fromEntries(d.trend.map(t => [t.date.slice(5), t.rate])))}</div><div class=card><h3>Absenteeism by department (%)</h3>${bars(d.absenteeism_pct_by_department)}</div>
  <div class=card><h3>Leave days by type</h3>${bars(d.leave_days_by_type)}</div><div class=card><h3>Top 5 late-comers</h3>${table([['Name', x => esc(x.name)], ['Late days', x => x.late_days]], d.top_late_comers)}</div>
  <div class=card><h3>Headcount by department</h3>${bars(d.headcount_by_department)}</div>${a ? `<div class=card><h3>Payroll cost by department</h3>${bars(d.payroll_cost_by_department)}</div>` : ''}</div>` + annBlock());
    onForm('flt', v => { window.dq = Object.fromEntries(Object.entries(v).filter(x => x[1])); reload() });
    $('#sum').onclick = () => {
        const b = [`Attendance rate is ${d.attendance_rate}% (${d.range.from} to ${d.range.to}); ${d.late_pct}% of attended days were late.`, `${d.headcount} active employee(s): ${d.present_today} present, ${d.on_leave_today} on leave, ${d.late_today} late today.`, `${d.pending_approvals} approval(s) are waiting for HR.`];
        if (d.top_late_comers[0]) b.push(`Most late days: ${d.top_late_comers[0].name} (${d.top_late_comers[0].late_days}).`); const w = Object.entries(d.absenteeism_pct_by_department).sort((x, y) => y[1] - x[1])[0]; if (w && w[1] > 0) b.push(`Highest absenteeism: ${w[0]} at ${w[1]}%.`);
        $('#sumout').innerHTML = '<ul>' + b.map(x => `<li>${esc(x)}</li>`).join('') + '</ul><span class=ai>Generated from your data</span>'
    }
};
V.ann = () => {
    const a = S.annList(), can = ME.role !== 'employee'; main(head('Announcements') + (can ? `<div class=card>${form('f', [['title', 'Title', 'text', 'required'], ['body', 'Message', 'textarea', '']], 'Post announcement')}</div>` : '') +
        `<div class=card>${a.length ? a.map(x => `<p><b>${esc(x.title)}</b> <span class=mut>${esc(x.author)}, ${x.ts.slice(0, 10)}</span><br>${esc(x.body)}</p>`).join('') : '<p class=empty>No announcements yet.</p>'}</div>`); onForm('f', v => { S.annAdd(v); toast('Posted'); reload() })
};
V.notes = () => { const n = S.notes(); main(head('Notifications') + `<div class=card>${n.length ? n.map(x => `<p ${x.read ? 'class=mut' : ''}>${esc(x.text)} <span class=mut>${x.ts.slice(0, 10)}</span></p>`).join('') : '<p class=empty>No notifications yet.</p>'}</div>`); S.readNotes() };
V.setup = () => {
    const s = S.settings(), m = M; main(head('Company setup') + `<div class=card><h3>Office rules (apply to new records)</h3>${form('st', [['company', 'Company', 'text', `value="${esc(s.company)}"`], ['start', 'Office start', 'time', `value=${s.start}`], ['grace', 'Grace (min)', 'number', `value=${s.grace}`], ['halfday', 'Half day under (hours)', 'number', `value=${s.halfday}`], ['lat', 'Office latitude', 'text', `value="${s.lat}"`], ['lng', 'Office longitude', 'text', `value="${s.lng}"`], ['radius', 'Radius (m)', 'number', `value=${s.radius}`]], 'Save settings')}<p class=mut>Weekend is Saturday and Sunday.</p></div>
  <div class=grid2><div class=card><h3>Departments</h3>${form('d', [['name', 'Name', 'text', 'required']], 'Add')}<p>${m.depts.map(x => `<span class=tag>${esc(x.name)}</span> `).join('') || '<span class=empty>Add your first department.</span>'}</p></div>
  <div class=card><h3>Designations</h3>${form('g', [['name', 'Name', 'text', 'required']], 'Add')}<p>${m.desigs.map(x => `<span class=tag>${esc(x.name)}</span> `).join('') || '<span class=empty>None yet.</span>'}</p></div>
  <div class=card><h3>Leave types and yearly quotas</h3>${table([['Type', x => x[0]], ['Quota', x => x[1] || 'unlimited']], Object.entries(m.leaveTypes))}${form('l', [['name', 'Type', 'text', 'required'], ['quota', 'Days per year', 'number', 'required min=0']], 'Save leave type')}</div>
  <div class=card><h3>Public holidays</h3>${table([['Date', x => x.date], ['Name', x => esc(x.name)]], m.holidays)}${form('h', [['date', 'Date', 'date', 'required'], ['name', 'Name', 'text', 'required']], 'Add holiday')}</div></div>`);
    onForm('st', v => { S.saveSettings(v); toast('Saved') });[['d', 'depts'], ['g', 'desigs'], ['l', 'leaveTypes'], ['h', 'holidays']].forEach(([f, k]) => onForm(f, v => { S.addMaster(k, v); toast('Saved'); reload() }))
};
V.users = () => {
    const u = S.users(); main(head('Logins') + `<div class=card><h3>Create HR login</h3>${form('f', [['name', 'Name', 'text', 'required'], ['email', 'Email', 'email', 'required'], ['password', 'Temporary password', 'text', 'required minlength=6']], 'Create HR login')}</div>
  <div class=card>${table([['Name', x => esc(x.name)], ['Email', x => esc(x.email)], ['Role', x => x.role], ['Status', x => x.active ? tag('active') : tag('absent').replace('absent', 'inactive')], ['', x => x.role === 'admin' ? '' : `<button class="btn sm ghost" data-t=${x.id}>${x.active ? 'Deactivate' : 'Activate'}</button> <button class="btn sm ghost" data-r=${x.id}>Reset password</button>`]], u)}</div>`);
    onForm('f', v => { S.addHR(v); toast('HR login created'); reload() }); act('[data-t]', d => { S.toggleUser(d.t); reload() }); act('[data-r]', d => { const p = prompt('New temporary password (6+ characters)'); if (p) { S.resetUser(d.r, p); toast('Password reset') } })
};
V.audit = () => main(head('Audit log') + `<div class=card>${table([['Time', x => x.ts.slice(0, 19).replace('T', ' ')], ['Actor', x => esc(x.actor)], ['Action', x => x.action], ['Entity', x => x.entity], ['Before', x => `<code>${esc(x.before)}</code>`], ['After', x => `<code>${esc(x.after)}</code>`]], S.audit())}</div>`);
V.emps = () => {
    const hr = ME.role === 'hr', q = window.eq || {}, r = S.empList(q.q, q.dept);
    main(head('Employees') + (hr ? `<div class=card><h3>Register employee (creates their login)</h3>${form('f', [['code', 'Code', 'text', 'required'], ['name', 'Name', 'text', 'required'], ['email', 'Email', 'email', 'required'], ['dept', 'Department', 'select', opts(M.depts)], ['desig', 'Designation', 'select', [['', '—'], ...opts(M.desigs)]], ['join', 'Join date', 'date', 'required'], ['basic', 'Basic salary', 'number', 'required min=1'], ['phone', 'Phone']], 'Register employee')}<div id=tp></div></div>` : '') +
        `<div class=card>${form('s', [['q', 'Search', 'search', `value="${esc(q.q || '')}"`], ['dept', 'Department', 'select', [['', 'All'], ...opts(M.depts)]]], 'Search')} ${hr ? '<button class="btn ghost" id=csv>Export CSV</button>' : ''}
  ${table([['Code', e => e.code], ['Name', e => esc(e.name)], ['Department', e => esc(e.dept_name)], ['Designation', e => esc(e.desig_name || '')], ['Joined', e => e.join], ['Basic', e => money(e.basic)], ['Status', e => tag(e.status)], ['', e => `<button class="btn sm ghost" data-v=${e.id}>360</button>` + (hr ? ` <button class="btn sm ghost" data-s=${e.id}>Salary</button> <button class="btn sm ghost" data-x=${e.id}>Mark exited</button>` : '')]], r)}<p class=mut>${r.length} employee(s)</p></div>`);
    if (hr) onForm('f', v => { const t = S.empCreate(v); $('#tp').innerHTML = `<p class=tag>Login created. Temporary password: <b>${esc(t)}</b> (shown once)</p>`; toast('Employee registered') });
    onForm('s', v => { window.eq = v; reload() });
    act('[data-v]', d => { const e = S.empGet(d.v); alert(`${e.name} (${e.code})\n${e.dept_name || ''}\nJoined ${e.join}\nAttendance rate this month: ${e.att.rate}%  late: ${e.att.late}  absent: ${e.att.absent}\nLeave left: ${e.balance.filter(b => b.left !== null).map(b => b.type + ' ' + b.left).join(', ')}`) });
    act('[data-s]', d => { const b = prompt('New basic salary'); if (b) { S.empUpdate(d.s, { basic: b }); toast('Salary updated'); reload() } }); act('[data-x]', d => { if (confirm('Mark exited and deactivate login?')) { S.empUpdate(d.x, { status: 'exited', exit: ymd() }); reload() } });
    if (hr) $('#csv').onclick = () => dl(S.exportCsv(), 'employees.csv')
};
V.profile = () => { const e = ME.employee; main(head('Profile') + `<div class=card><p><b>${esc(e.name)}</b> (${esc(e.code)}) · ${esc(e.dept_name || '')} ${esc(e.desig_name || '')} · joined ${e.join}</p>${form('f', [['phone', 'Phone', 'text', `value="${esc(e.phone)}"`], ['address', 'Address', 'text', `value="${esc(e.address)}"`]], 'Save contact details')}</div>`); onForm('f', v => { S.saveContact(v); toast('Saved') }) };
V.att = () => {
    if (ME.role === 'employee') {
        const d = S.myAtt(), c = S.corrList();
        main(head('My attendance') + `<div class=kpis>${kpi(d.summary.rate + '%', 'Attendance rate')}${kpi(d.summary.late, 'Late')}${kpi(d.summary.absent, 'Absent')}${kpi(d.summary.on_leave, 'On leave')}</div><div class=card>${table([['Date', x => x.date], ['Status', x => tag(x.status)], ['In', x => x.rec?.in || '—'], ['Out', x => x.rec?.out || '—']], d.days)}</div>
    <div class=card><h3>Request a correction</h3>${form('f', [['date', 'Date', 'date', 'required'], ['check_in', 'Check in', 'time', 'required'], ['check_out', 'Check out', 'time', ''], ['reason', 'Reason', 'text', 'required']], 'Send request')}</div><div class=card><h3>My requests</h3>${table([['Date', x => x.date], ['Reason', x => esc(x.reason)], ['Status', x => tag(x.status)], ['Comment', x => esc(x.comment || '')]], c)}</div>`);
        onForm('f', v => { S.corrAdd(v); toast('Request sent'); reload() }); return
    }
    const date = window.bd || ymd(), b = S.board(date), c = ME.role === 'hr' ? S.corrList() : [];
    main(head('Attendance board') + `<div class=card>${form('f', [['date', 'Date', 'date', `value=${date}`]], 'Show')}${table([['Employee', x => esc(x.name)], ['Status', x => tag(x.status)], ['In', x => x.rec?.in || '—'], ['Out', x => x.rec?.out || '—']], b)}</div>` +
        (ME.role === 'hr' ? `<div class=card><h3>Correction requests</h3>${table([['Employee', x => esc(x.name)], ['Date', x => x.date], ['Times', x => `${x.in || ''}–${x.out || ''}`], ['Reason', x => esc(x.reason)], ['Status', x => tag(x.status)], ['', x => x.status === 'pending' ? `<button class="btn sm" data-a=${x.id}>Approve</button> <button class="btn sm no" data-n=${x.id}>Reject</button>` : '']], c)}</div>` : ''));
    onForm('f', v => { window.bd = v.date; reload() }); const dec = ap => d => { const cm = prompt('Comment (optional)') || ''; S.corrDecide(d.a || d.n, ap, cm); reload() }; act('[data-a]', dec(true)); act('[data-n]', dec(false))
};
V.leaves = () => {
    const l = S.leaveList();
    if (ME.role === 'employee') {
        const b = S.balance();
        main(head('Leave') + `<div class=card><h3>Smart leave</h3><p class=mut>Describe what you need in plain words. You confirm before anything is saved.</p><form id=sm><label>Request<input name=text placeholder="I need next Monday and Tuesday off for my sister's wedding" required></label><button class="btn alt">Fill the form</button></form></div>
    <div class=card><h3>Apply for leave</h3>${form('f', [['type', 'Type', 'select', Object.keys(M.leaveTypes).map(k => [k, k])], ['start', 'From', 'date', 'required'], ['end', 'To', 'date', 'required'], ['reason', 'Reason']], 'Apply')}<p class=mut>${b.map(x => `${x.type}: ${x.left ?? 'unlimited'} left`).join(' · ')}</p></div>
    <div class=card><h3>My leave</h3>${table([['Type', x => x.type], ['From', x => x.sd], ['To', x => x.ed], ['Days', x => x.days], ['Status', x => tag(x.status)], ['Comment', x => esc(x.comment || '')], ['', x => ['pending', 'approved'].includes(x.status) ? `<button class="btn sm ghost" data-c=${x.id}>Cancel</button>` : '']], l)}</div>`);
        onForm('sm', v => { const r = S.smartLeave(v.text), f = $('#f');['type', 'start', 'end', 'reason'].forEach(k => f.elements[k].value = r[k]); toast('Form filled. Check the details, then press Apply.') });
        onForm('f', v => { const n = S.leaveApply(v); toast(`Applied for ${n} working day(s)`); reload() }); act('[data-c]', d => { S.leaveCancel(d.c); reload() }); return
    }
    main(head(ME.role === 'hr' ? 'Leave approvals' : 'Leave') + `<div class=card>${table([['Employee', x => esc(x.name)], ['Type', x => x.type], ['From', x => x.sd], ['To', x => x.ed], ['Days', x => x.days], ['Reason', x => esc(x.reason || '')], ['Status', x => tag(x.status)], ['Comment', x => esc(x.comment || '')], ['', x => ME.role === 'hr' && x.status === 'pending' ? `<button class="btn sm" data-a=${x.id}>Approve</button> <button class="btn sm no" data-n=${x.id}>Reject</button>` : '']], l)}</div>`);
    const dec = ap => d => { const cm = prompt('Comment (optional)') || ''; S.leaveDecide(d.a || d.n, ap, cm); toast(ap ? 'Approved' : 'Rejected'); reload() }; act('[data-a]', dec(true)); act('[data-n]', dec(false))
};
const printSlip = id => { const p = S.slips().find(x => x.id == id); if (!p) throw new Error('Payslip not available'); const w = window.open('', '_blank'); w.document.write(`<title>Payslip ${p.month}</title><body style="font-family:sans-serif;max-width:480px;margin:30px auto"><h2>${esc(ME.company)}</h2><p>Payslip ${p.month}${DB.runs[p.month] === 'draft' ? ' (DRAFT)' : ''}<br>${esc(p.name)} (${esc(p.code)}) · ${p.working_days} working days</p><table width=100% cellpadding=6 border=1 style="border-collapse:collapse"><tr><td>Gross</td><td>${p.gross}</td></tr><tr><td>Absent days</td><td>${p.absent}</td></tr><tr><td>Unpaid leave days</td><td>${p.unpaid}</td></tr><tr><td>Half days</td><td>${p.half}</td></tr><tr><td>Deductions</td><td>${p.deduction}</td></tr><tr><td>Tax</td><td>${p.tax}</td></tr><tr><td><b>Net pay</b></td><td><b>${p.net}</b></td></tr></table><p><small>Choose “Save as PDF” in the print dialog.</small></p></body>`); w.document.close(); w.print() };
V.payroll = () => {
    const m = window.pm || ymd().slice(0, 7), p = S.payGet(m), hr = ME.role === 'hr', fin = p.status === 'finalized';
    main(head('Payroll') + `<div class=card>${form('f', [['m', 'Month', 'month', `value=${m}`]], 'Open month')} ${hr && !fin ? '<button class=btn id=run>' + (p.status ? 'Recalculate draft' : 'Create draft') + '</button>' : ''} ${!hr && p.status && !fin ? '<button class="btn alt" id=fin>Finalize and lock</button>' : ''}
  <p>${p.status ? `Status: ${tag(p.status)} · Gross ${money(p.gross)} · Net ${money(p.net)}` : '<span class=empty>No payroll for this month yet. HR creates the draft; Admin finalizes it.</span>'}</p>
  ${table([['Employee', x => esc(x.name)], ['Days', x => x.working_days], ['Gross', x => money(x.gross)], ['Absent', x => x.absent], ['Unpaid', x => x.unpaid], ['Half', x => x.half], ['Deductions', x => money(x.deduction)], ['Tax', x => money(x.tax)], ['Net', x => `<b>${money(x.net)}</b>`], ['', x => `<button class="btn sm ghost" data-p=${x.id}>Payslip</button>`]], p.rows)}</div>`);
    onForm('f', v => { window.pm = v.m; reload() }); if ($('#run')) $('#run').onclick = () => { try { S.payRun(m); toast('Draft ready'); reload() } catch (e) { toast(e.message, 1) } };
    if ($('#fin')) $('#fin').onclick = () => { if (confirm('Finalize ' + m + '? This locks the month.')) { try { S.payFinalize(m); toast('Finalized'); reload() } catch (e) { toast(e.message, 1) } } }; act('[data-p]', d => printSlip(d.p))
};
V.slips = () => { const s = S.slips(); main(head('Payslips') + `<div class=card>${table([['Month', x => x.month], ['Gross', x => money(x.gross)], ['Deductions', x => money(x.deduction)], ['Tax', x => money(x.tax)], ['Net', x => `<b>${money(x.net)}</b>`], ['', x => `<button class="btn sm" data-p=${x.id}>Download PDF</button>`]], s)}${s.length ? '' : '<p class=mut>Payslips appear here once Admin finalizes the month.</p>'}</div>`); act('[data-p]', d => printSlip(d.p)) };
V.ai = () => {
    const ex = ME.role === 'employee' ? ['How many sick leaves do I have left this year?', 'What is the late policy?', 'What is a colleague’s salary?'] : ['Who is on leave today?', 'Who came late most often this month?', 'What is this month’s attendance rate?'];
    main(head('Assistant') + `<div class=card><div class=chat id=chat><div class="m a">Hi ${esc(ME.name)}. Ask about ${ME.role === 'employee' ? 'your own leave and attendance, or company policy' : 'headcount, attendance, leave and payroll'}. I answer from the data in this app.</div></div>
  <form id=f><label style="flex:3">Question<input name=message required autocomplete=off></label><button class="btn alt">Ask</button></form><p>${ex.map(x => `<button class="btn sm ghost" data-e="${esc(x)}">${esc(x)}</button>`).join(' ')}</p></div>`);
    const ask = t => { const c = $('#chat'); let a; try { a = S.ask(t) } catch (e) { a = e.message } c.innerHTML += `<div class="m u">${esc(t)}</div><div class="m a">${esc(a)}</div>`; c.scrollTop = 1e9 }; onForm('f', v => { $('#f').reset(); ask(v.message) }); act('[data-e]', d => ask(d.e))
};
boot();