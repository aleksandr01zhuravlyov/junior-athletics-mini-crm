// =====================================================
// 1. THE DATA
// This is where all student information is stored.
// It is a list (array) of students. Each student is an object
// written between { }.
// =====================================================
const defaultStudents = [
  { id: 1, firstName: "Emma",   lastName: "Johnson", age: 9,  parentName: "Sarah Johnson", parentPhone: "555-0101", membership: "Monthly",         sessionsRemaining: 8,  status: "none" },
  { id: 2, firstName: "Liam",   lastName: "Smith",   age: 11, parentName: "David Smith",   parentPhone: "555-0102", membership: "10-Session Pass", sessionsRemaining: 6,  status: "none" },
  { id: 3, firstName: "Olivia", lastName: "Brown",   age: 8,  parentName: "Karen Brown",   parentPhone: "555-0103", membership: "Monthly",         sessionsRemaining: 12, status: "none" },
  { id: 4, firstName: "Noah",   lastName: "Davis",   age: 12, parentName: "Mark Davis",    parentPhone: "555-0104", membership: "Drop-in",         sessionsRemaining: 1,  status: "none" },
  { id: 5, firstName: "Sophia", lastName: "Wilson",  age: 10, parentName: "Anna Wilson",   parentPhone: "555-0105", membership: "10-Session Pass", sessionsRemaining: 3,  status: "none" }
];
// status can be: "none" (not marked yet), "present" or "absent"

// The name of our "box" inside localStorage.
const STORAGE_KEY = "juniorAthleticsStudents";

// LOAD: read the saved students from localStorage.
// If nothing was saved yet (first visit), use the starter students.
function loadStudents() {
  const savedText = localStorage.getItem(STORAGE_KEY); // text, or null
  if (savedText === null) {
    return defaultStudents;
  }
  const list = JSON.parse(savedText); // turn the text back into a list

  // Old saved students (from before this update) have no id or parent info.
  // Give them safe defaults so nothing breaks.
  let nextId = list.reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;
  list.forEach(function (student) {
    if (!student.id) student.id = nextId++;
    if (student.parentName === undefined) student.parentName = "";
    if (student.parentPhone === undefined) student.parentPhone = "";
  });
  return list;
}

// SAVE: turn the students list into text and store it.
// We call this every time the data changes.
function saveStudents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

let students = loadStudents();


// =====================================================
// 2. GRAB THINGS FROM THE PAGE
// We find HTML elements by their id so JavaScript can change them.
// =====================================================
const tableBody = document.getElementById("student-table-body");
const presentCount = document.getElementById("present-count");
const absentCount = document.getElementById("absent-count");
const totalCount = document.getElementById("total-count");
const addButton = document.getElementById("add-student-btn");

// The form pop-up (used for both Add and Edit)
const formDialog = document.getElementById("form-dialog");
const form = document.getElementById("student-form");
const formTitle = document.getElementById("form-title");

// The details pop-up
const detailsDialog = document.getElementById("details-dialog");
const detailsTitle = document.getElementById("details-title");
const detailsBody = document.getElementById("details-body");

// Which student is being edited? null means "we are adding a new one".
let editingId = null;

// Names are typed by a person, so make them safe before putting them in HTML.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Find one student by id (returns undefined if not found).
function findStudent(id) {
  return students.find(s => s.id === id);
}


// =====================================================
// 3. DRAW THE PAGE FROM THE DATA
// This function wipes the table and rebuilds it from the
// students list. We call it every time something changes.
// =====================================================
function render() {
  tableBody.innerHTML = ""; // empty the table

  // Go through each student, one by one
  students.forEach(function (student) {
    let statusText = "Not marked";
    let statusClass = "status-none";
    if (student.status === "present") { statusText = "Present"; statusClass = "status-present"; }
    if (student.status === "absent")  { statusText = "Absent";  statusClass = "status-absent"; }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
      <td>${student.age}</td>
      <td>${escapeHtml(student.membership)}</td>
      <td>${student.sessionsRemaining}</td>
      <td class="${statusClass}">${statusText}</td>
      <td>
        <button class="btn-present ${student.status === "present" ? "active" : ""}"
                onclick="markPresent(${student.id})">Present</button>
        <button class="btn-absent ${student.status === "absent" ? "active" : ""}"
                onclick="markAbsent(${student.id})">Absent</button>
      </td>
      <td>
        <button class="btn-small" onclick="showDetails(${student.id})">View</button>
        <button class="btn-small" onclick="openEditForm(${student.id})">Edit</button>
        <button class="btn-small btn-delete" onclick="deleteStudent(${student.id})">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  updateCounters();
}


// =====================================================
// 4. THE COUNTERS
// Count how many students have each status.
// =====================================================
function updateCounters() {
  const present = students.filter(s => s.status === "present").length;
  const absent = students.filter(s => s.status === "absent").length;

  presentCount.textContent = present;
  absentCount.textContent = absent;
  totalCount.textContent = students.length;
}


// =====================================================
// 5. THE BUTTONS
// =====================================================

// Runs when you click "Present" on a student.
function markPresent(id) {
  const student = findStudent(id);

  // If they were not already present, use up one session.
  if (student.status !== "present" && student.sessionsRemaining > 0) {
    student.sessionsRemaining = student.sessionsRemaining - 1;
  }

  student.status = "present";
  saveStudents(); // remember the change
  render(); // redraw the page with the new data
}

// Runs when you click "Absent" on a student.
function markAbsent(id) {
  const student = findStudent(id);

  // If they had been marked present by mistake, give the session back.
  if (student.status === "present") {
    student.sessionsRemaining = student.sessionsRemaining + 1;
  }

  student.status = "absent";
  saveStudents(); // remember the change
  render();
}


// =====================================================
// 6. CRUD: Create, Read, Update, Delete
// =====================================================

// ---- CREATE (part 1): open the empty form ----
function openAddForm() {
  editingId = null;
  formTitle.textContent = "Add Student";
  form.reset();
  formDialog.showModal();
}

// ---- UPDATE (part 1): open the form filled with the student's data ----
function openEditForm(id) {
  const student = findStudent(id);
  editingId = id;
  formTitle.textContent = "Edit Student";

  document.getElementById("f-first").value = student.firstName;
  document.getElementById("f-last").value = student.lastName;
  document.getElementById("f-age").value = student.age;
  document.getElementById("f-parent").value = student.parentName;
  document.getElementById("f-phone").value = student.parentPhone;
  document.getElementById("f-sessions").value = student.sessionsRemaining;

  // If this student has a custom membership not in the list, add it so it isn't lost.
  const select = document.getElementById("f-membership");
  if (![...select.options].some(o => o.value === student.membership)) {
    select.add(new Option(student.membership));
  }
  select.value = student.membership;

  formDialog.showModal();
}

// ---- CREATE (part 2) and UPDATE (part 2): runs when you press Save ----
// If editingId is null we create a new student, otherwise we update one.
function saveStudentFromForm(event) {
  event.preventDefault(); // stop the browser reloading the page

  const values = {
    firstName: document.getElementById("f-first").value.trim(),
    lastName: document.getElementById("f-last").value.trim(),
    age: Number(document.getElementById("f-age").value),
    parentName: document.getElementById("f-parent").value.trim(),
    parentPhone: document.getElementById("f-phone").value.trim(),
    membership: document.getElementById("f-membership").value,
    sessionsRemaining: Number(document.getElementById("f-sessions").value)
  };

  if (editingId === null) {
    // CREATE: new id = biggest existing id + 1
    const newId = students.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    students.push({ id: newId, ...values, status: "none" });
  } else {
    // UPDATE: copy the new values onto the existing student
    Object.assign(findStudent(editingId), values);
  }

  saveStudents();
  render();
  formDialog.close();
}

// ---- READ (one student): show the details pop-up ----
function showDetails(id) {
  const s = findStudent(id);
  detailsTitle.textContent = s.firstName + " " + s.lastName;
  detailsBody.innerHTML = `
    <dt>Age</dt><dd>${s.age}</dd>
    <dt>Parent name</dt><dd>${escapeHtml(s.parentName) || "-"}</dd>
    <dt>Parent phone</dt><dd>${escapeHtml(s.parentPhone) || "-"}</dd>
    <dt>Membership</dt><dd>${escapeHtml(s.membership)}</dd>
    <dt>Sessions remaining</dt><dd>${s.sessionsRemaining}</dd>
  `;
  detailsDialog.showModal();
}

// ---- DELETE: ask first, then remove the student ----
function deleteStudent(id) {
  const s = findStudent(id);
  if (!confirm("Delete " + s.firstName + " " + s.lastName + "? This cannot be undone.")) {
    return;
  }
  students = students.filter(student => student.id !== id); // keep everyone except this one
  saveStudents();
  render();
}

// Connect the buttons to the functions above
addButton.addEventListener("click", openAddForm);
form.addEventListener("submit", saveStudentFromForm);
document.getElementById("form-cancel").addEventListener("click", () => formDialog.close());
document.getElementById("details-close").addEventListener("click", () => detailsDialog.close());


// =====================================================
// 7. START
// Draw the page once when it first loads.
// =====================================================
render();
