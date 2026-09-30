// =====================================================
// 1. SUPABASE CONNECTION
// Uses only the public Project URL + publishable key from config.js.
// Student data now lives in the Supabase "students" table.
// (supabase-js itself keeps the login session in the browser; that is
// the only thing stored locally. No student data is stored locally.)
// =====================================================
const configured = !SUPABASE_URL.includes("YOUR-PROJECT-REF") && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");
const db = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

// The students shown on screen: a copy of what the database returned.
let students = [];
// status can be: "none" (not marked yet), "present" or "absent"

// The database uses snake_case columns; the page code uses camelCase.
// This is the ONLY place that translates between the two.
function fromRow(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    parentName: row.parent_name || "",
    parentPhone: row.parent_phone || "",
    membership: row.membership_type || "",
    sessionsRemaining: row.sessions_remaining ?? 0,
    status: row.status || "none"
  };
}

// Age is not stored; it is calculated from date_of_birth.
function calcAge(dateOfBirth) {
  if (!dateOfBirth) return "-";
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}


// =====================================================
// 2. GRAB THINGS FROM THE PAGE
// =====================================================
const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const userBox = document.getElementById("user-box");
const userEmail = document.getElementById("user-email");
const appError = document.getElementById("app-error");
const tableMessage = document.getElementById("table-message");

const tableBody = document.getElementById("student-table-body");
const presentCount = document.getElementById("present-count");
const absentCount = document.getElementById("absent-count");
const totalCount = document.getElementById("total-count");
const addButton = document.getElementById("add-student-btn");

const formDialog = document.getElementById("form-dialog");
const form = document.getElementById("student-form");
const formTitle = document.getElementById("form-title");
const formSave = document.getElementById("form-save");

const detailsDialog = document.getElementById("details-dialog");
const detailsTitle = document.getElementById("details-title");
const detailsBody = document.getElementById("details-body");

// Which student is being edited? null means "we are adding a new one".
let editingId = null;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function findStudent(id) {
  return students.find(s => s.id === id);
}

function showError(text) {
  appError.textContent = text;
  appError.hidden = !text;
}


// =====================================================
// 3. AUTH: login, logout, and which screen to show
// =====================================================
function showLogin() {
  students = [];
  trainings = [];
  render(); // wipe the previous user's rows from the page
  renderTrainings();
  showTab("students");
  appView.hidden = true;
  userBox.hidden = true;
  loginView.hidden = false;
}

function showApp(user) {
  loginView.hidden = true;
  appView.hidden = false;
  userBox.hidden = false;
  userEmail.textContent = user.email;
  loadStudents();
}

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;

  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value
  });

  loginSubmit.disabled = false;
  if (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    return;
  }
  loginForm.reset();
  // On success, onAuthStateChange (below) switches to the app screen.
});

document.getElementById("logout-btn").addEventListener("click", async function () {
  const { error } = await db.auth.signOut();
  if (error) showError(error.message);
});


// =====================================================
// 4. DRAW THE PAGE FROM THE DATA
// =====================================================
function render() {
  tableBody.innerHTML = "";

  students.forEach(function (student) {
    let statusText = "Not marked";
    let statusClass = "status-none";
    if (student.status === "present") { statusText = "Present"; statusClass = "status-present"; }
    if (student.status === "absent")  { statusText = "Absent";  statusClass = "status-absent"; }

    // ids are uuid text now, so buttons carry them in data- attributes
    // and one click listener (below) reads them.
    const row = document.createElement("tr");
    row.dataset.id = student.id;
    row.innerHTML = `
      <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
      <td>${calcAge(student.dateOfBirth)}</td>
      <td>${escapeHtml(student.membership)}</td>
      <td>${student.sessionsRemaining}</td>
      <td class="${statusClass}">${statusText}</td>
      <td>
        <button data-action="present" class="btn-present ${student.status === "present" ? "active" : ""}">Present</button>
        <button data-action="absent" class="btn-absent ${student.status === "absent" ? "active" : ""}">Absent</button>
      </td>
      <td>
        <button data-action="view" class="btn-small">View</button>
        <button data-action="edit" class="btn-small">Edit</button>
        <button data-action="delete" class="btn-small btn-delete">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  tableMessage.hidden = students.length > 0;
  if (students.length === 0 && tableMessage.textContent === "Loading students...") {
    tableMessage.textContent = "No students yet.";
  }
  updateCounters();
}

function updateCounters() {
  presentCount.textContent = students.filter(s => s.status === "present").length;
  absentCount.textContent = students.filter(s => s.status === "absent").length;
  totalCount.textContent = students.length;
}

tableBody.addEventListener("click", function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest("tr").dataset.id;
  const actions = {
    present: markPresent, absent: markAbsent, view: showDetails,
    edit: openEditForm, delete: deleteStudent
  };
  actions[button.dataset.action](id);
});


// =====================================================
// 5. READ: load students from Supabase
// =====================================================
async function loadStudents() {
  showError("");
  tableMessage.textContent = "Loading students...";
  tableMessage.hidden = false;

  const { data, error } = await db
    .from("students")
    .select("*")
    .order("last_name")
    .order("first_name");

  if (error) {
    students = [];
    render();
    tableMessage.textContent = "";
    showError("Could not load students: " + error.message);
    return;
  }
  students = data.map(fromRow);
  tableMessage.textContent = "No students yet.";
  render();
}

// Put one updated row (returned by the database) back into our list.
function replaceStudent(row) {
  const updated = fromRow(row);
  students = students.map(s => (s.id === updated.id ? updated : s));
}


// =====================================================
// 6. ATTENDANCE: update status + sessions in the database
// =====================================================
async function updateStudent(id, changes) {
  showError("");
  const { data, error } = await db
    .from("students")
    .update(changes)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    showError("Could not save: " + error.message);
    return false;
  }
  replaceStudent(data);
  render();
  return true;
}

async function markPresent(id) {
  const student = findStudent(id);
  if (student.status === "present") return; // already present, nothing to change

  const changes = { status: "present" };
  // Use up one session if any are left.
  if (student.sessionsRemaining > 0) {
    changes.sessions_remaining = student.sessionsRemaining - 1;
  }
  await updateStudent(id, changes);
}

async function markAbsent(id) {
  const student = findStudent(id);
  if (student.status === "absent") return;

  const changes = { status: "absent" };
  // If they had been marked present by mistake, give the session back.
  if (student.status === "present") {
    changes.sessions_remaining = student.sessionsRemaining + 1;
  }
  await updateStudent(id, changes);
}


// =====================================================
// 7. CRUD: Create, Update, Delete
// =====================================================
function openAddForm() {
  editingId = null;
  formTitle.textContent = "Add Student";
  form.reset();
  formDialog.showModal();
}

function openEditForm(id) {
  const student = findStudent(id);
  editingId = id;
  formTitle.textContent = "Edit Student";

  document.getElementById("f-first").value = student.firstName;
  document.getElementById("f-last").value = student.lastName;
  document.getElementById("f-dob").value = student.dateOfBirth || "";
  document.getElementById("f-parent").value = student.parentName;
  document.getElementById("f-phone").value = student.parentPhone;
  document.getElementById("f-sessions").value = student.sessionsRemaining;

  // If this student has a custom membership not in the list, add it so it isn't lost.
  const select = document.getElementById("f-membership");
  if (student.membership && ![...select.options].some(o => o.value === student.membership)) {
    select.add(new Option(student.membership));
  }
  select.value = student.membership;

  formDialog.showModal();
}

// Runs when you press Save: INSERT if adding, UPDATE if editing.
async function saveStudentFromForm(event) {
  event.preventDefault();

  const values = {
    first_name: document.getElementById("f-first").value.trim(),
    last_name: document.getElementById("f-last").value.trim(),
    date_of_birth: document.getElementById("f-dob").value,
    parent_name: document.getElementById("f-parent").value.trim(),
    parent_phone: document.getElementById("f-phone").value.trim(),
    membership_type: document.getElementById("f-membership").value,
    sessions_remaining: Number(document.getElementById("f-sessions").value)
  };

  showError("");
  formSave.disabled = true;

  let result;
  if (editingId === null) {
    result = await db.from("students").insert({ ...values, status: "none" }).select().single();
  } else {
    result = await db.from("students").update(values).eq("id", editingId).select().single();
  }
  formSave.disabled = false;

  if (result.error) {
    formDialog.close();
    showError("Could not save student: " + result.error.message);
    return;
  }

  if (editingId === null) {
    students.push(fromRow(result.data));
    students.sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName));
  } else {
    replaceStudent(result.data);
  }
  render();
  formDialog.close();
}

function showDetails(id) {
  const s = findStudent(id);
  detailsTitle.textContent = s.firstName + " " + s.lastName;
  detailsBody.innerHTML = `
    <dt>Date of birth</dt><dd>${escapeHtml(s.dateOfBirth || "-")} (age ${calcAge(s.dateOfBirth)})</dd>
    <dt>Parent name</dt><dd>${escapeHtml(s.parentName) || "-"}</dd>
    <dt>Parent phone</dt><dd>${escapeHtml(s.parentPhone) || "-"}</dd>
    <dt>Membership</dt><dd>${escapeHtml(s.membership)}</dd>
    <dt>Sessions remaining</dt><dd>${s.sessionsRemaining}</dd>
  `;
  detailsDialog.showModal();
  loadAttendanceHistory(id);
}

async function deleteStudent(id) {
  const s = findStudent(id);
  if (!confirm("Delete " + s.firstName + " " + s.lastName + "? This cannot be undone.")) {
    return;
  }
  showError("");

  // .select() makes the database return the deleted rows, so we can detect
  // "nothing was deleted" (for example if RLS blocked it) instead of failing silently.
  const { data, error } = await db.from("students").delete().eq("id", id).select();
  if (error) {
    showError("Could not delete: " + error.message);
    return;
  }
  if (data.length === 0) {
    showError("Could not delete: the database did not remove this student.");
    return;
  }
  students = students.filter(student => student.id !== id);
  render();
}

addButton.addEventListener("click", openAddForm);
form.addEventListener("submit", saveStudentFromForm);
document.getElementById("form-cancel").addEventListener("click", () => formDialog.close());
document.getElementById("details-close").addEventListener("click", () => detailsDialog.close());


// =====================================================
// 7b. TRAININGS: browse by month, create / edit / cancel / delete
// Data lives in the Supabase "trainings" table (one row per session).
// =====================================================
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const trainingsView = document.getElementById("trainings-view");
const studentsView = document.getElementById("students-view");
const trainingList = document.getElementById("training-list");
const trainingMessage = document.getElementById("training-message");
const monthSelect = document.getElementById("month-select");
const yearInput = document.getElementById("year-input");
const trainingDialog = document.getElementById("training-dialog");
const trainingForm = document.getElementById("training-form");
const trainingFormError = document.getElementById("training-form-error");
const trainingSave = document.getElementById("training-save");

let trainings = [];
let editingTrainingId = null;   // null = creating a new training
let trainingsRequest = 0;       // ignores answers from an older month if you click fast
const todayDate = new Date();
let viewYear = todayDate.getFullYear();
let viewMonth = todayDate.getMonth() + 1; // 1-12

MONTH_NAMES.forEach((name, i) => monthSelect.add(new Option(name, i + 1)));

// Dates are kept as "YYYY-MM-DD" text and never converted through time zones.
function pad(n) { return String(n).padStart(2, "0"); }
function shortTime(t) { return String(t).slice(0, 5); }   // "17:00:00" -> "17:00"
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday}, ${pad(d)} ${MONTH_NAMES[m - 1]} ${y}`;
}

function showTab(name) {
  const onTrainings = name === "trainings";
  studentsView.hidden = onTrainings;
  trainingsView.hidden = !onTrainings;
  document.getElementById("tab-students").classList.toggle("active", !onTrainings);
  document.getElementById("tab-trainings").classList.toggle("active", onTrainings);
  if (onTrainings) loadTrainings().catch(function (err) {
    showError("Could not load trainings: " + err.message);
  });
}

document.querySelector(".tabs").addEventListener("click", function (event) {
  const tab = event.target.closest("button[data-tab]");
  if (tab) showTab(tab.dataset.tab);
});

function setMonth(year, month) {
  // month may be 0 or 13 when stepping past the ends of the year
  const d = new Date(year, month - 1, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
  loadTrainings();
}
document.getElementById("month-prev").addEventListener("click", () => setMonth(viewYear, viewMonth - 1));
document.getElementById("month-next").addEventListener("click", () => setMonth(viewYear, viewMonth + 1));
document.getElementById("month-today").addEventListener("click", () => setMonth(todayDate.getFullYear(), todayDate.getMonth() + 1));
monthSelect.addEventListener("change", () => setMonth(viewYear, Number(monthSelect.value)));
yearInput.addEventListener("change", function () {
  const y = Number(yearInput.value);
  if (y >= 2000 && y <= 2100) setMonth(y, viewMonth);
  else yearInput.value = viewYear;
});

async function loadTrainings() {
  monthSelect.value = viewMonth;
  yearInput.value = viewYear;
  showError("");
  trainingMessage.textContent = "Loading trainings...";
  trainingMessage.hidden = false;
  const request = ++trainingsRequest;

  const from = `${viewYear}-${pad(viewMonth)}-01`;
  const next = new Date(viewYear, viewMonth, 1); // first day of the following month
  const to = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;

  const { data, error } = await db
    .from("trainings")
    .select("*")
    .gte("training_date", from)
    .lt("training_date", to)
    .order("training_date")
    .order("start_time");

  if (request !== trainingsRequest) return; // a newer month was requested meanwhile
  if (error) {
    trainings = [];
    renderTrainings();
    trainingMessage.hidden = true;
    showError("Could not load trainings: " + error.message);
    return;
  }
  trainings = data;
  renderTrainings();
}

function findTraining(id) {
  return trainings.find(t => t.id === id);
}

function renderTrainings() {
  trainingList.innerHTML = "";
  let lastDate = null;
  trainings.forEach(function (t) {
    if (t.training_date !== lastDate) {
      lastDate = t.training_date;
      const heading = document.createElement("h3");
      heading.className = "day-heading";
      heading.textContent = longDate(t.training_date);
      trainingList.appendChild(heading);
    }
    const row = document.createElement("div");
    row.className = "training-row" + (t.status === "cancelled" ? " is-cancelled" : "");
    row.dataset.id = t.id;
    const details = [t.coach && "Coach: " + t.coach, t.location].filter(Boolean).map(escapeHtml).join(" · ");
    row.innerHTML = `
      <div class="training-time">${shortTime(t.start_time)}–${shortTime(t.end_time)}</div>
      <div class="training-main">
        <strong>${escapeHtml(t.name)}</strong>
        <div class="training-sub">${details}</div>
      </div>
      <span class="badge badge-${t.status}">${t.status}</span>
      <div>
        <button data-action="open" class="btn-small">Attendance</button>
        <button data-action="edit" class="btn-small">Edit</button>
        ${t.status === "cancelled" ? "" : '<button data-action="cancel" class="btn-small">Cancel</button>'}
        <button data-action="delete" class="btn-small btn-delete">Delete</button>
      </div>
    `;
    trainingList.appendChild(row);
  });
  trainingMessage.textContent = `No trainings in ${MONTH_NAMES[viewMonth - 1]} ${viewYear}.`;
  trainingMessage.hidden = trainings.length > 0;
}

trainingList.addEventListener("click", function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest(".training-row").dataset.id;
  const actions = {
    open: openAttendance, edit: openTrainingForm,
    cancel: cancelTraining, delete: deleteTraining
  };
  actions[button.dataset.action](id);
});

// ----- create / edit -----
function openTrainingForm(id) {
  editingTrainingId = typeof id === "string" ? id : null;
  trainingForm.reset();
  trainingFormError.hidden = true;
  if (editingTrainingId) {
    const t = findTraining(editingTrainingId);
    document.getElementById("training-form-title").textContent = "Edit Training";
    document.getElementById("t-date").value = t.training_date;
    document.getElementById("t-start").value = shortTime(t.start_time);
    document.getElementById("t-end").value = shortTime(t.end_time);
    document.getElementById("t-name").value = t.name;
    document.getElementById("t-coach").value = t.coach;
    document.getElementById("t-location").value = t.location;
    document.getElementById("t-status").value = t.status;
  } else {
    document.getElementById("training-form-title").textContent = "New Training";
    // default to the first day of the month being viewed (or today if it is in it)
    const inThisMonth = todayDate.getFullYear() === viewYear && todayDate.getMonth() + 1 === viewMonth;
    document.getElementById("t-date").value = `${viewYear}-${pad(viewMonth)}-${pad(inThisMonth ? todayDate.getDate() : 1)}`;
  }
  trainingDialog.showModal();
}

trainingForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const values = {
    training_date: document.getElementById("t-date").value,
    start_time: document.getElementById("t-start").value,
    end_time: document.getElementById("t-end").value,
    name: document.getElementById("t-name").value.trim(),
    coach: document.getElementById("t-coach").value.trim(),
    location: document.getElementById("t-location").value.trim(),
    status: document.getElementById("t-status").value
  };
  if (values.end_time <= values.start_time) {
    trainingFormError.textContent = "End time must be after start time.";
    trainingFormError.hidden = false;
    return;
  }
  trainingFormError.hidden = true;
  trainingSave.disabled = true;

  const query = editingTrainingId
    ? db.from("trainings").update(values).eq("id", editingTrainingId)
    : db.from("trainings").insert(values);
  const { data, error } = await query.select().single();
  trainingSave.disabled = false;

  if (error) {
    trainingFormError.textContent = "Could not save training: " + error.message;
    trainingFormError.hidden = false;
    return;
  }
  trainingDialog.close();
  // Jump to the month of the saved training so you can see it.
  const [y, m] = data.training_date.split("-").map(Number);
  viewYear = y;
  viewMonth = m;
  loadTrainings();
});
document.getElementById("add-training-btn").addEventListener("click", openTrainingForm);
document.getElementById("training-cancel").addEventListener("click", () => trainingDialog.close());

// ----- cancel (keeps the record) / delete (removes it and its attendance) -----
async function cancelTraining(id) {
  const t = findTraining(id);
  if (!confirm(`Cancel "${t.name}" on ${longDate(t.training_date)}? It stays in the list marked as cancelled.`)) return;
  showError("");
  const { data, error } = await db.from("trainings").update({ status: "cancelled" }).eq("id", id).select();
  if (error || data.length === 0) {
    showError("Could not cancel training: " + (error ? error.message : "the database did not update it."));
    return;
  }
  loadTrainings();
}

async function deleteTraining(id) {
  const t = findTraining(id);
  if (!confirm(`Delete "${t.name}" on ${longDate(t.training_date)}? Its attendance records will be deleted too. This cannot be undone.`)) return;
  showError("");
  const { data, error } = await db.from("trainings").delete().eq("id", id).select();
  if (error || data.length === 0) {
    showError("Could not delete training: " + (error ? error.message : "the database did not remove it."));
    return;
  }
  loadTrainings();
}


// =====================================================
// 7c. ATTENDANCE for one training (table "attendance")
// One row per (training, student). Clicking Present/Absent saves at once.
// =====================================================
const attendanceDialog = document.getElementById("attendance-dialog");
const attendanceBody = document.getElementById("attendance-body");
const attendanceError = document.getElementById("attendance-error");
let openTrainingId = null;
let attendanceByStudent = {};   // student_id -> "present" | "absent"

function showAttendanceError(text) {
  attendanceError.textContent = text;
  attendanceError.hidden = !text;
}

async function openAttendance(id) {
  const t = findTraining(id);
  openTrainingId = id;
  attendanceByStudent = {};
  showAttendanceError("");
  document.getElementById("attendance-title").textContent = t.name;
  document.getElementById("attendance-info").textContent =
    `${longDate(t.training_date)} · ${shortTime(t.start_time)}–${shortTime(t.end_time)}` +
    (t.coach ? " · Coach: " + t.coach : "") + (t.location ? " · " + t.location : "") + " · " + t.status;
  attendanceBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  attendanceDialog.showModal();

  // Always read from the database, so reopening shows what was really saved.
  const { data, error } = await db.from("attendance").select("student_id, status").eq("training_id", id);
  if (openTrainingId !== id) return;
  if (error) {
    showAttendanceError("Could not load attendance: " + error.message);
    attendanceBody.innerHTML = "";
    return;
  }
  data.forEach(a => { attendanceByStudent[a.student_id] = a.status; });
  renderAttendance();
}

function renderAttendance() {
  const t = findTraining(openTrainingId);
  const locked = t.status === "cancelled";
  attendanceBody.innerHTML = "";
  students.forEach(function (s) {
    const status = attendanceByStudent[s.id];
    const row = document.createElement("tr");
    row.dataset.id = s.id;
    row.innerHTML = `
      <td>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</td>
      <td>
        <button data-status="present" class="btn-present ${status === "present" ? "active" : ""}" ${locked ? "disabled" : ""}>Present</button>
        <button data-status="absent" class="btn-absent ${status === "absent" ? "active" : ""}" ${locked ? "disabled" : ""}>Absent</button>
        ${status ? "" : '<span class="status-none">Not marked</span>'}
      </td>`;
    attendanceBody.appendChild(row);
  });
  const values = Object.values(attendanceByStudent);
  const present = values.filter(v => v === "present").length;
  const absent = values.filter(v => v === "absent").length;
  document.getElementById("attendance-summary").textContent = students.length === 0
    ? "There are no students yet."
    : locked
      ? "This training is cancelled, so attendance cannot be changed."
      : `Present: ${present} · Absent: ${absent} · Not marked: ${students.length - present - absent}`;
}

attendanceBody.addEventListener("click", async function (event) {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  const studentId = button.closest("tr").dataset.id;
  const trainingId = openTrainingId;
  const status = button.dataset.status;
  if (attendanceByStudent[studentId] === status) return;

  showAttendanceError("");
  // upsert = insert, or update if this student already has a row for this training
  const { data, error } = await db
    .from("attendance")
    .upsert({ training_id: trainingId, student_id: studentId, status: status }, { onConflict: "training_id,student_id" })
    .select("student_id, status")
    .single();
  if (error) {
    showAttendanceError("Could not save attendance: " + error.message);
    return;
  }
  if (openTrainingId !== trainingId) return;
  attendanceByStudent[data.student_id] = data.status;
  renderAttendance();
});
document.getElementById("attendance-close").addEventListener("click", () => attendanceDialog.close());
attendanceDialog.addEventListener("close", () => { openTrainingId = null; });


// =====================================================
// 7d. ATTENDANCE HISTORY in the student profile, grouped by month
// =====================================================
const historyBox = document.getElementById("attendance-history");
let historyStudentId = null;

async function loadAttendanceHistory(studentId) {
  historyStudentId = studentId;
  historyBox.innerHTML = '<p class="message">Loading...</p>';

  // "trainings(...)" pulls the linked training row through the foreign key.
  const { data, error } = await db
    .from("attendance")
    .select("status, trainings(training_date, start_time, name)")
    .eq("student_id", studentId);
  if (historyStudentId !== studentId) return; // another profile was opened meanwhile
  if (error) {
    historyBox.innerHTML = `<p class="message error">Could not load history: ${escapeHtml(error.message)}</p>`;
    return;
  }
  const rows = data.filter(r => r.trainings)
    .sort((a, b) => (b.trainings.training_date + b.trainings.start_time)
      .localeCompare(a.trainings.training_date + a.trainings.start_time)); // newest first
  if (rows.length === 0) {
    historyBox.innerHTML = '<p class="message">No attendance recorded yet.</p>';
    return;
  }

  let html = "";
  let currentMonth = null;
  rows.forEach(function (r) {
    const [y, m, d] = r.trainings.training_date.split("-").map(Number);
    const monthLabel = `${MONTH_NAMES[m - 1]} ${y}`;
    if (monthLabel !== currentMonth) {
      if (currentMonth) html += "</ul>";
      currentMonth = monthLabel;
      html += `<div class="history-month">${monthLabel}</div><ul class="history-list">`;
    }
    const cls = r.status === "present" ? "status-present" : "status-absent";
    const label = r.status === "present" ? "Present" : "Absent";
    html += `<li>${pad(d)}.${pad(m)} — <span class="${cls}">${label}</span> <span class="training-sub">(${escapeHtml(r.trainings.name)})</span></li>`;
  });
  historyBox.innerHTML = html + "</ul>";
}


// =====================================================
// 8. START
// Show the right screen depending on whether a session exists.
// =====================================================
if (!configured) {
  loginView.hidden = false;
  loginError.textContent = "Supabase is not configured. Put your Project URL and publishable key in config.js.";
  loginError.hidden = false;
  loginSubmit.disabled = true;
} else {
  // Fires on page load (restored session), login and logout.
  // Not async and not awaiting supabase calls here on purpose (supabase-js can deadlock otherwise).
  let shownUserId = null;
  db.auth.onAuthStateChange(function (event, session) {
    if (session) {
      if (session.user.id === shownUserId) return; // e.g. token refresh: already showing the app
      shownUserId = session.user.id;
      setTimeout(() => showApp(session.user), 0);
    } else {
      shownUserId = null;
      showLogin();
    }
  });
}
