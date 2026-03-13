const fs = require("fs");

// Helper: convert "hh:mm:ss am/pm" to total seconds
function timeToSeconds(timeStr) {
  timeStr = timeStr.trim().toLowerCase();
  const parts = timeStr.split(" ");
  const period = parts[1];
  const timeParts = parts[0].split(":");
  let h = parseInt(timeParts[0], 10);
  const m = parseInt(timeParts[1], 10);
  const s = parseInt(timeParts[2], 10);

  if (period === "am") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h * 3600 + m * 60 + s;
}

// Helper: convert seconds to "h:mm:ss"
function secondsToHMS(totalSecs) {
  if (totalSecs < 0) totalSecs = 0;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Helper: convert "h:mm:ss" or "hhh:mm:ss" to total seconds
function hmsToSeconds(hms) {
  if (!hms || typeof hms !== "string") return 0;
  const parts = hms.trim().split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  return h * 3600 + m * 60 + s;
}

// Helper: read file lines safely, skip empty lines
function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.split("\n").filter(line => line.trim() !== "");
}

// Function 1
function getShiftDuration(startTime, endTime) {
  let diff = timeToSeconds(endTime) - timeToSeconds(startTime);
  if (diff < 0) diff += 24 * 3600; // handle overnight shifts
  return secondsToHMS(diff);
}

// Function 2
function getIdleTime(startTime, endTime) {
  const start = timeToSeconds(startTime);
  const end = timeToSeconds(endTime);
  const deliveryStart = 8 * 3600;  // 8:00 AM
  const deliveryEnd = 22 * 3600;   // 10:00 PM

  let idle = 0;
  if (start < deliveryStart) idle += deliveryStart - start;
  if (end > deliveryEnd) idle += end - deliveryEnd;
  return secondsToHMS(idle);
}

// Function 3
function getActiveTime(shiftDuration, idleTime) {
  const diff = hmsToSeconds(shiftDuration) - hmsToSeconds(idleTime);
  return secondsToHMS(diff);
}

// Function 4
function metQuota(date, activeTime) {
  const parts = date.trim().split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  let quota;
  if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
    quota = 6 * 3600;
  } else {
    quota = 8 * 3600 + 24 * 60; // 8h 24m
  }

  return hmsToSeconds(activeTime) >= quota;
}

// Function 5
function addShiftRecord(textFile, shiftObj) {
  const { driverID, driverName, date, startTime, endTime } = shiftObj;
  let lines = readLines(textFile);

  // Check for duplicate
  for (let line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID.trim() && cols[2].trim() === date.trim()) {
      return {};
    }
  }

  const shiftDuration = getShiftDuration(startTime, endTime);
  const idleTime = getIdleTime(startTime, endTime);
  const activeTime = getActiveTime(shiftDuration, idleTime);
  const quota = metQuota(date, activeTime);

  const newRecord = `${driverID},${driverName},${date},${startTime},${endTime},${shiftDuration},${idleTime},${activeTime},${quota},false`;

  // Insert after last record of same driverID, or at end
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].split(",")[0].trim() === driverID.trim()) lastIdx = i;
  }

  if (lastIdx === -1) {
    lines.push(newRecord);
  } else {
    lines.splice(lastIdx + 1, 0, newRecord);
  }

  fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");

  return {
    driverID,
    driverName,
    date,
    startTime,
    endTime,
    shiftDuration,
    idleTime,
    activeTime,
    metQuota: quota,
    hasBonus: false,
  };
}

// Function 6
function setBonus(textFile, driverID, date, newValue) {
  let lines = readLines(textFile);

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols[0].trim() === driverID.trim() && cols[2].trim() === date.trim()) {
      cols[9] = String(newValue);
      lines[i] = cols.join(",");
      break;
    }
  }

  fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
}

// Function 7
function countBonusPerMonth(textFile, driverID, month) {
  const lines = readLines(textFile);
  const targetMonth = parseInt(month, 10);
  let found = false;
  let count = 0;

  for (let line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() !== driverID.trim()) continue;
    found = true;
    const recordMonth = parseInt(cols[2].trim().split("-")[1], 10);
    if (recordMonth === targetMonth && cols[9].trim() === "true") count++;
  }

  return found ? count : -1;
}

// Function 8
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
  const lines = readLines(textFile);
  let total = 0;

  for (let line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() !== driverID.trim()) continue;
    const recordMonth = parseInt(cols[2].trim().split("-")[1], 10);
    if (recordMonth !== month) continue;
    total += hmsToSeconds(cols[7].trim());
  }

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Function 9
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
  const shifts = readLines(textFile);
  const rates = readLines(rateFile);

  let dayOff = "";
  for (let line of rates) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID.trim()) {
      dayOff = cols[1].trim().toLowerCase();
      break;
    }
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  let total = 0;
  for (let line of shifts) {
    const cols = line.split(",");
    if (cols[0].trim() !== driverID.trim()) continue;

    const dateStr = cols[2].trim();
    const dateParts = dateStr.split("-");
    const year = parseInt(dateParts[0], 10);
    const recordMonth = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);

    if (recordMonth !== month) continue;

    // Skip day off
    const d = new Date(dateStr);
    const weekday = dayNames[d.getDay()];
    if (weekday === dayOff) continue;

    // Eid quota
    let dailyQuota;
    if (year === 2025 && recordMonth === 4 && day >= 10 && day <= 30) {
      dailyQuota = 6 * 3600;
    } else {
      dailyQuota = 8 * 3600 + 24 * 60;
    }
    total += dailyQuota;
  }

  // Deduct 2 hours per bonus
  total -= bonusCount * 2 * 3600;
  if (total < 0) total = 0;

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Function 10
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
  const rates = readLines(rateFile);

  let basePay = 0;
  let tier = 0;
  for (let line of rates) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID.trim()) {
      basePay = parseInt(cols[2].trim(), 10);
      tier = parseInt(cols[3].trim(), 10);
      break;
    }
  }

  const actual = hmsToSeconds(actualHours);
  const required = hmsToSeconds(requiredHours);

  if (actual >= required) return basePay;

  const missingSeconds = required - actual;
  const missingHours = Math.floor(missingSeconds / 3600);

  const allowedMissing = { 1: 50, 2: 20, 3: 10, 4: 3 };
  const allowed = allowedMissing[tier] || 0;

  const billable = Math.max(0, missingHours - allowed);
  const deductionRate = Math.floor(basePay / 185);
  const deduction = billable * deductionRate;

  return basePay - deduction;
}

module.exports = {
  getShiftDuration,
  getIdleTime,
  getActiveTime,
  metQuota,
  addShiftRecord,
  setBonus,
  countBonusPerMonth,
  getTotalActiveHoursPerMonth,
  getRequiredHoursPerMonth,
  getNetPay,
};
