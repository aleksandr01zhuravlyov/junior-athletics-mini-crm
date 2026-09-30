// Membership rules that need no database: labels, effective status, "current" membership.
// Kept separate from script.js so they can be tested with plain Node (tests/memberships.test.js).
// Dates are "YYYY-MM-DD" text and are compared as text, never through time zones.

const MEMBERSHIP_TYPES = {
  monthly_unlimited: { label: "Monthly Unlimited", counter: "none",     sessions: null, months: 1 },
  monthly_1x:        { label: "Monthly 1x/week",   counter: "none",     sessions: null, months: 1 },
  flex_5:            { label: "Flex 5",            counter: "required", sessions: 5,    months: 2 },
  flex_10:           { label: "Flex 10",           counter: "required", sessions: 10,   months: 3 },
  custom:            { label: "Custom",            counter: "optional", sessions: null, months: 1 }
};

function membershipTypeLabel(type) {
  return MEMBERSHIP_TYPES[type] ? MEMBERSHIP_TYPES[type].label : String(type);
}

// Today as "YYYY-MM-DD" in the browser's local time.
function todayISO(now) {
  const d = now || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Suggested expiration: N months after the start, minus one day (end of the last day).
function suggestedExpiration(type, startISO) {
  const months = (MEMBERSHIP_TYPES[type] || MEMBERSHIP_TYPES.custom).months;
  const [y, m, d] = startISO.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();   // last day of target month
  const end = new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// What to DISPLAY. "expired" is never stored: an active membership past its
// expiration_date shows as expired. cancelled / used_up are kept as they are.
function effectiveStatus(m, today) {
  if (m.status === "active" && m.expiration_date < today) return "expired";
  return m.status;
}

function hasCounter(m) {
  return m.sessions_purchased !== null && m.sessions_purchased !== undefined;
}

// Usable on a given day: active, started, not expired. (Same rule as the database trigger.)
function isActiveOn(m, day) {
  return effectiveStatus(m, day) === "active" && m.start_date <= day && m.expiration_date >= day;
}

// The membership to show as "current" for a student (list is one student's memberships).
// Several can overlap: take the one that expires first, like the database does when charging.
function pickCurrent(list, day) {
  return list
    .filter(m => isActiveOn(m, day))
    .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date)
      || a.created_at.localeCompare(b.created_at))[0] || null;
}

// Nearest membership that starts in the future (shown when there is no current one).
function pickUpcoming(list, day) {
  return list
    .filter(m => m.status === "active" && m.start_date > day)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
}

// "3 of 5 left", "Unlimited", "1x / week", or "-".
function sessionsLabel(m) {
  if (!m) return "-";
  if (hasCounter(m)) return `${m.sessions_remaining} of ${m.sessions_purchased} left`;
  if (m.membership_type === "monthly_unlimited") return "Unlimited";
  if (m.membership_type === "monthly_1x") return "1x / week";
  return "-";
}

if (typeof module !== "undefined") {
  module.exports = { MEMBERSHIP_TYPES, membershipTypeLabel, todayISO, suggestedExpiration,
    effectiveStatus, hasCounter, isActiveOn, pickCurrent, pickUpcoming, sessionsLabel };
}
