// =====================================================
// 1. THE DATA
// This is where all student information is stored.
// It is a list (array) of students. Each student is an object
// written between { }.
// =====================================================
let students = [
  { firstName: "Emma",  lastName: "Johnson", age: 9,  membership: "Monthly",  sessionsRemaining: 8,  status: "none" },
  { firstName: "Liam",  lastName: "Smith",   age: 11, membership: "10-Session Pass", sessionsRemaining: 6, status: "none" },
  { firstName: "Olivia", lastName: "Brown",  age: 8,  membership: "Monthly",  sessionsRemaining: 12, status: "none" },
  { firstName: "Noah",  lastName: "Davis",   age: 12, membership: "Drop-in",  sessionsRemaining: 1,  status: "none" },
  { firstName: "Sophia", lastName: "Wilson", age: 10, membership: "10-Session Pass", sessionsRemaining: 3, status: "none" }
];
// status can be: "none" (not marked yet), "present" or "absent"


// =====================================================
// 2. GRAB THINGS FROM THE PAGE
// We find HTML elements by their id so JavaScript can change them.
// =====================================================
const tableBody = document.getElementById("student-table-body");
const presentCount = document.getElementById("present-count");
const absentCount = document.getElementById("absent-count");
const totalCount = document.getElementById("total-count");
const addButton = document.getElementById("add-student-btn");


// =====================================================
// 3. DRAW THE PAGE FROM THE DATA
// This function wipes the table and rebuilds it from the
// students list. We call it every time something changes.
// =====================================================
function render() {
  tableBody.innerHTML = ""; // empty the table

  // Go through each student, one by one
  students.forEach(function (student, index) {
    let statusText = "Not marked";
    let statusClass = "status-none";
    if (student.status === "present") { statusText = "Present"; statusClass = "status-present"; }
    if (student.status === "absent")  { statusText = "Absent";  statusClass = "status-absent"; }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${student.firstName} ${student.lastName}</td>
      <td>${student.age}</td>
      <td>${student.membership}</td>
      <td>${student.sessionsRemaining}</td>
      <td class="${statusClass}">${statusText}</td>
      <td>
        <button class="btn-present ${student.status === "present" ? "active" : ""}"
                onclick="markPresent(${index})">Present</button>
        <button class="btn-absent ${student.status === "absent" ? "active" : ""}"
                onclick="markAbsent(${index})">Absent</button>
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
function markPresent(index) {
  const student = students[index];

  // If they were not already present, use up one session.
  if (student.status !== "present" && student.sessionsRemaining > 0) {
    student.sessionsRemaining = student.sessionsRemaining - 1;
  }

  student.status = "present";
  render(); // redraw the page with the new data
}

// Runs when you click "Absent" on a student.
function markAbsent(index) {
  const student = students[index];

  // If they had been marked present by mistake, give the session back.
  if (student.status === "present") {
    student.sessionsRemaining = student.sessionsRemaining + 1;
  }

  student.status = "absent";
  render();
}

// Runs when you click "+ Add Student".
addButton.addEventListener("click", function () {
  const firstName = prompt("First name:");
  if (!firstName) return; // stop if cancelled or empty

  const lastName = prompt("Last name:");
  if (!lastName) return;

  const age = Number(prompt("Age:"));
  if (!age) return;

  const membership = prompt("Membership type (e.g. Monthly, 10-Session Pass, Drop-in):");
  if (!membership) return;

  const sessions = Number(prompt("Sessions remaining:"));

  // Add a new student object to the end of the list
  students.push({
    firstName: firstName,
    lastName: lastName,
    age: age,
    membership: membership,
    sessionsRemaining: sessions || 0,
    status: "none"
  });

  render();
});


// =====================================================
// 6. START
// Draw the page once when it first loads.
// =====================================================
render();
