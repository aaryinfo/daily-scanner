const { spawn } = require("child_process");
const path = require("path");

const runScript = () => {
  const scriptPath = path.resolve(__dirname, "download-spurts-api.js");
  console.log(new Date().toLocaleString(), "- Starting daily spurts download...");
  const child = spawn(process.execPath, [scriptPath], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    console.log(new Date().toLocaleString(), `- download-spurts-api exited with code ${code}`);
  });
};

const getNextFivePm = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(17, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

const scheduleNext = () => {
  const nextRun = getNextFivePm();
  const delay = nextRun.getTime() - Date.now();
  console.log(`Next download scheduled at ${nextRun.toLocaleString()}`);
  setTimeout(() => {
    runScript();
    scheduleNext();
  }, delay);
};

scheduleNext();
