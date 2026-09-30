// Browser smoke test of the Memberships UI. Run: NODE_PATH=$(npm root -g) node tests/ui_smoke.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const assert = require("node:assert");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());   // confirm() for "Cancel membership"

  const today = new Date().toLocaleDateString("en-CA");   // YYYY-MM-DD, local
  const stub = "window.__TODAY__=" + JSON.stringify(today) + ";\n" + fs.readFileSync(path.join(__dirname, "fake-supabase.js"), "utf8");
  await page.route("**/@supabase/supabase-js@2", r => r.fulfill({ contentType: "application/javascript", body: stub }));
  await page.goto("file://" + root + "/index.html");
  await page.waitForSelector("#student-table-body tr");

  const row = name => page.locator("#student-table-body tr", { hasText: name });
  const cells = async name => (await row(name).locator("td").allInnerTexts()).map(s => s.trim());

  // Students list before any membership
  let c = await cells("Ann");
  assert.deepEqual([c[2], c[3]], ["None", "-"]);

  // --- add Flex 5 for Ann
  await row("Ann").getByText("View").click();
  assert.match(await page.locator("#current-membership").innerText(), /No active membership/);
  await page.click("#add-membership-btn");
  assert.equal(await page.locator("#m-purchased-label").isVisible(), false, "monthly default: no counter field");
  await page.selectOption("#m-type", "flex_5");
  assert.equal(await page.inputValue("#m-purchased"), "5");
  assert.ok(await page.inputValue("#m-end") > today, "expiration suggested");
  await page.fill("#m-price", "100");
  await page.click("#membership-save");
  await page.waitForFunction(() => document.querySelector("#membership-dialog").open === false);
  assert.match(await page.locator("#current-membership").innerText(), /5 of 5 sessions remaining/);
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", "profile-flex.png") });
  await page.click("#details-close");
  c = await cells("Ann");
  assert.deepEqual([c[2], c[3]], ["Flex 5", "5"]);

  // --- Monthly Unlimited for Bob: no counter; his old "active" 2020 membership shows as expired
  await row("Bob").getByText("View").click();
  await page.click("#add-membership-btn");
  await page.selectOption("#m-type", "monthly_unlimited");
  await page.click("#membership-save");
  await page.waitForFunction(() => document.querySelector("#membership-dialog").open === false);
  const bobProfile = await page.locator("#details-dialog").innerText();
  assert.match(bobProfile, /Unlimited/);
  assert.doesNotMatch(await page.locator("#current-membership").innerText(), /remaining/);
  const history = await page.locator("#membership-history tbody tr").allInnerTexts();
  assert.equal(history.length, 2, "full history kept");
  assert.match(history.join("|"), /Monthly 1x\/week.*expired/is);
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", "profile-monthly.png") });
  await page.click("#details-close");
  c = await cells("Bob");
  assert.deepEqual([c[2], c[3]], ["Monthly Unlimited", "Unlimited"]);

  // --- attendance flows on the Trainings tab
  await page.click("#tab-trainings");
  await page.waitForSelector(".training-row");
  await page.locator(".training-row [data-action=open]").first().click();
  const annRow = page.locator("#attendance-body tr", { hasText: "Ann" });
  const annMembership = async () => (await annRow.locator("td").nth(1).innerText()).trim();
  assert.equal(await annMembership(), "Flex 5 · 5 left");
  await annRow.getByText("Present").click();
  await page.waitForFunction(() => document.querySelector("#attendance-body tr td:nth-child(2)").innerText.includes("4 left"));
  await annRow.getByText("Present").click();                 // second Present: no second deduction
  await page.waitForTimeout(100);
  assert.equal(await annMembership(), "Flex 5 · 4 left");
  await annRow.getByText("Absent").click();                  // Present -> Absent returns it
  await page.waitForFunction(() => document.querySelector("#attendance-body tr td:nth-child(2)").innerText.includes("5 left"));
  await annRow.getByText("Present").click();
  await page.waitForFunction(() => document.querySelector("#attendance-body tr td:nth-child(2)").innerText.includes("4 left"));
  await page.locator("#attendance-body tr", { hasText: "Bob" }).getByText("Present").click();
  await page.waitForTimeout(100);
  assert.equal((await page.locator("#attendance-body tr", { hasText: "Bob" }).locator("td").nth(1).innerText()).trim(), "Monthly Unlimited");
  await page.click("#attendance-close");

  // Students tab reflects it
  await page.click("#tab-students");
  await page.waitForTimeout(100);
  c = await cells("Ann");
  assert.equal(c[3], "4");

  // --- cancel Ann's membership: history keeps it, current becomes none
  await row("Ann").getByText("View").click();
  await page.locator("#membership-history").getByText("Cancel").click();
  await page.waitForFunction(() => document.querySelector("#current-membership").innerText.includes("No active membership"));
  assert.match(await page.locator("#membership-history").innerText(), /Flex 5[\s\S]*cancelled/i);

  // --- validation: expiration before start is refused
  await page.click("#add-membership-btn");
  await page.fill("#m-start", "2026-05-10");
  await page.fill("#m-end", "2026-05-01");
  await page.click("#membership-save");
  assert.match(await page.locator("#membership-form-error").innerText(), /not be before/);

  assert.deepEqual(errors, [], "no page errors");
  await browser.close();
  console.log("UI SMOKE TEST PASSED");
})().catch(e => { console.error(e); process.exit(1); });
