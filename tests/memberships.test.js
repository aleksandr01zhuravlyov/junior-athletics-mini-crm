// Run: node --test tests/memberships.test.js
const test = require("node:test");
const assert = require("node:assert");
const M = require("../memberships.js");

const mk = (o) => ({ id: "x", membership_type: "flex_5", start_date: "2026-09-01", expiration_date: "2026-10-31",
  sessions_purchased: 5, sessions_remaining: 5, status: "active", created_at: "2026-09-01T00:00:00Z", ...o });

test("expired is derived from expiration_date", () => {
  assert.equal(M.effectiveStatus(mk({}), "2026-10-31"), "active");      // last day still valid
  assert.equal(M.effectiveStatus(mk({}), "2026-11-01"), "expired");
  assert.equal(M.effectiveStatus(mk({ status: "cancelled" }), "2026-11-01"), "cancelled");
  assert.equal(M.effectiveStatus(mk({ status: "used_up" }), "2026-11-01"), "used_up");
});

test("pickCurrent ignores expired, cancelled, used up and future memberships", () => {
  const day = "2026-09-30";
  const list = [
    mk({ id: "old", expiration_date: "2026-09-29" }),
    mk({ id: "cancelled", status: "cancelled" }),
    mk({ id: "usedup", status: "used_up" }),
    mk({ id: "future", start_date: "2026-10-05" })
  ];
  assert.equal(M.pickCurrent(list, day), null);
  assert.equal(M.pickUpcoming(list, day).id, "future");
  list.push(mk({ id: "now" }));
  assert.equal(M.pickCurrent(list, day).id, "now");
});

test("overlapping memberships: the one expiring first is current", () => {
  const list = [mk({ id: "late", expiration_date: "2026-12-31" }), mk({ id: "soon", expiration_date: "2026-10-10" })];
  assert.equal(M.pickCurrent(list, "2026-09-30").id, "soon");
});

test("sessions label: counter for flex, none for monthly", () => {
  assert.equal(M.sessionsLabel(mk({ sessions_remaining: 3 })), "3 of 5 left");
  assert.equal(M.sessionsLabel(mk({ sessions_remaining: 0 })), "0 of 5 left");
  assert.equal(M.sessionsLabel(mk({ membership_type: "monthly_unlimited", sessions_purchased: null, sessions_remaining: null })), "Unlimited");
  assert.equal(M.sessionsLabel(mk({ membership_type: "monthly_1x", sessions_purchased: null, sessions_remaining: null })), "1x / week");
  assert.equal(M.sessionsLabel(null), "-");
});

test("suggested expiration", () => {
  assert.equal(M.suggestedExpiration("monthly_unlimited", "2026-09-01"), "2026-09-30");
  assert.equal(M.suggestedExpiration("monthly_unlimited", "2026-01-31"), "2026-02-27");
  assert.equal(M.suggestedExpiration("flex_5", "2026-09-15"), "2026-11-14");
  assert.equal(M.suggestedExpiration("flex_10", "2026-11-30"), "2027-02-27");
});

test("todayISO uses local date parts", () => {
  assert.equal(M.todayISO(new Date(2026, 0, 5)), "2026-01-05");
});
