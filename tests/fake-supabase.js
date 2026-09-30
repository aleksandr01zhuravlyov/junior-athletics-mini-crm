// Stand-in for the supabase-js CDN script, used ONLY by tests/ui_smoke.js.
// In-memory tables + a small copy of the membership trigger so the UI can be exercised end to end.
// (The real trigger is tested against Postgres in memberships_sql_test.sql.)
(function () {
  const today = window.__TODAY__;
  let n = 0;
  const id = () => "id" + (++n);
  const db = window.__DB__ = {
    students: [
      { id: "s-ann", first_name: "Ann", last_name: "Lee", date_of_birth: "2014-05-01", parent_name: "P", parent_phone: "1", status: "none" },
      { id: "s-bob", first_name: "Bob", last_name: "Ray", date_of_birth: "2013-05-01", parent_name: "P", parent_phone: "1", status: "none" }
    ],
    trainings: [
      { id: "t1", training_date: today, start_time: "17:00:00", end_time: "18:00:00", name: "Sprint", coach: "", location: "", status: "scheduled" }
    ],
    attendance: [],
    memberships: [
      // an "active" row whose expiration_date is in the past: must DISPLAY as expired
      { id: "m-old", student_id: "s-bob", membership_type: "monthly_1x", start_date: "2020-01-01", expiration_date: "2020-01-31",
        sessions_purchased: null, sessions_remaining: null, price: 50, status: "active", created_at: "2020-01-01T00:00:00Z" }
    ],
    charges: {}   // attendance_id -> membership_id
  };

  function normalize(m) {
    if (m.sessions_purchased != null && m.sessions_remaining == null) m.sessions_remaining = m.sessions_purchased;
    if (m.sessions_remaining != null) {
      if (m.status === "active" && m.sessions_remaining === 0) m.status = "used_up";
      else if (m.status === "used_up" && m.sessions_remaining > 0) m.status = "active";
    }
  }
  function syncAttendance(a) {
    const refund = () => {
      const mid = db.charges[a.id];
      if (!mid) return;
      delete db.charges[a.id];
      const m = db.memberships.find(x => x.id === mid);
      m.sessions_remaining = Math.min(m.sessions_purchased, m.sessions_remaining + 1);
      normalize(m);
    };
    if (a.status !== "present") return refund();
    if (db.charges[a.id]) return;
    const t = db.trainings.find(x => x.id === a.training_id);
    const m = db.memberships.filter(x => x.student_id === a.student_id && x.status === "active" && x.sessions_remaining > 0
      && x.start_date <= t.training_date && x.expiration_date >= t.training_date)
      .sort((p, q) => p.expiration_date.localeCompare(q.expiration_date))[0];
    if (!m) return;
    db.charges[a.id] = m.id;
    m.sessions_remaining -= 1;
    normalize(m);
  }

  class Q {
    constructor(table) { this.table = table; this.op = "select"; this.filters = []; this.orders = []; this.cols = "*"; this.one = false; }
    select(cols) { if (this.op === "select") this.cols = cols || "*"; return this; }
    insert(v) { this.op = "insert"; this.values = v; return this; }
    update(v) { this.op = "update"; this.values = v; return this; }
    upsert(v) { this.op = "upsert"; this.values = v; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c, v) { this.filters.push(r => r[c] === v); return this; }
    gte(c, v) { this.filters.push(r => r[c] >= v); return this; }
    lt(c, v) { this.filters.push(r => r[c] < v); return this; }
    order(c, o) { this.orders.push([c, o && o.ascending === false ? -1 : 1]); return this; }
    single() { this.one = true; return this; }
    then(ok, bad) { return Promise.resolve().then(() => this.run()).then(ok, bad); }
    run() {
      const rows = db[this.table];
      const matching = () => rows.filter(r => this.filters.every(f => f(r)));
      let out;
      if (this.op === "insert") {
        const row = { id: id(), created_at: new Date().toISOString(), status: "active", ...this.values };
        if (this.table === "memberships") {
          if (row.membership_type.startsWith("monthly") && row.sessions_purchased != null) return { data: null, error: { message: "check violation" } };
          normalize(row);
        }
        rows.push(row); out = [row];
      } else if (this.op === "update") {
        out = matching(); out.forEach(r => { Object.assign(r, this.values); if (this.table === "memberships") normalize(r); });
      } else if (this.op === "upsert") {
        let row = rows.find(r => r.training_id === this.values.training_id && r.student_id === this.values.student_id);
        if (row) Object.assign(row, this.values); else { row = { id: id(), created_at: "", ...this.values }; rows.push(row); }
        syncAttendance(row); out = [row];
      } else if (this.op === "delete") {
        out = matching(); db[this.table] = rows.filter(r => !out.includes(r));
      } else {
        out = matching().map(r => ({ ...r }));
        this.orders.slice().reverse().forEach(([c, d]) => out.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * d));
        if (this.table === "attendance" && this.cols.includes("trainings(")) out.forEach(r => { r.trainings = db.trainings.find(t => t.id === r.training_id); });
      }
      out = out.map(r => ({ ...r }));
      return { data: this.one ? out[0] : out, error: null };
    }
  }
  window.supabase = { createClient: () => ({
    from: t => new Q(t),
    auth: {
      onAuthStateChange(cb) { setTimeout(() => cb("SIGNED_IN", { user: { id: "u1", email: "coach@test" } }), 0); },
      signInWithPassword: async () => ({ error: null }), signOut: async () => ({ error: null })
    }
  }) };
})();
