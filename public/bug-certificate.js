// Draws the Bug Squasher certificate at print-friendly resolution.
(function (root) {
  const INK = "#1f2a44", BLUE = "#365486", GOLD = "#ffbd44";
  function roundPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function roundRect(g, x, y, w, h, r, fill) {
    roundPath(g, x, y, w, h, r); g.fillStyle = fill; g.fill();
  }
  function text(g, value, x, y, size, color, weight = 700, maxWidth) {
    let px = size;
    while (true) {
      g.font = `${weight} ${px}px "DM Sans", Arial, sans-serif`;
      if (!maxWidth || g.measureText(value).width <= maxWidth || px <= 16) break;
      px -= 2;
    }
    g.fillStyle = color;
    if (maxWidth) g.fillText(value, x, y, maxWidth);
    else g.fillText(value, x, y);
    return g.measureText(value).width;
  }
  // A consistent vector badge: a bug, with a verified patch check.
  function bugSeal(g, x, y) {
    g.save(); g.translate(x, y);
    g.strokeStyle = BLUE; g.lineWidth = 8; g.lineCap = "round"; g.lineJoin = "round";
    for (const side of [-1, 1]) {
      for (const dy of [-25, 6, 37]) {
        g.beginPath(); g.moveTo(side * 36, dy); g.lineTo(side * 66, dy - 10); g.lineTo(side * 80, dy + 1); g.stroke();
      }
      g.beginPath(); g.moveTo(side * 12, -61); g.lineTo(side * 27, -83); g.stroke();
    }
    g.fillStyle = BLUE;
    g.beginPath(); g.arc(0, -47, 25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, 8, 47, 59, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff8e8"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -28); g.lineTo(0, 59); g.stroke();
    g.fillStyle = GOLD;
    for (const side of [-1, 1]) for (const dy of [-10, 19]) {
      g.beginPath(); g.arc(side * 23, dy, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#fff8e8"; g.beginPath(); g.arc(53, 55, 39, 0, Math.PI * 2); g.fill();
    g.fillStyle = GOLD; g.beginPath(); g.arc(53, 55, 32, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 7;
    g.beginPath(); g.moveTo(38, 55); g.lineTo(49, 66); g.lineTo(70, 44); g.stroke();
    g.textAlign = "center";
    text(g, "PATCH VERIFIED", 0, 117, 18, BLUE, 700);
    g.restore();
  }

  async function create({ name, rank, code, date, venue }) {
    if (document.fonts?.ready) await document.fonts.ready;
    const logo = new Image();
    logo.src = "/logo.png";
    try { await Promise.race([logo.decode(), new Promise((done) => setTimeout(done, 1500))]); }
    catch { /* The certificate still works offline without the mark. */ }
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas is unavailable on this device");
    g.fillStyle = "#f3efe6"; g.fillRect(0, 0, 1600, 1000);
    roundRect(g, 38, 38, 1524, 924, 24, "#fffdf8");
    g.save(); roundPath(g, 38, 38, 1524, 924, 24); g.clip();
    g.fillStyle = INK; g.fillRect(1120, 38, 442, 924);
    g.fillStyle = GOLD; g.fillRect(1112, 38, 8, 924);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2; roundPath(g, 38, 38, 1524, 924, 24); g.stroke();
    if (logo.naturalWidth) {
      const fit = Math.min(68 / logo.naturalWidth, 68 / logo.naturalHeight);
      g.drawImage(logo, 104, 98, logo.naturalWidth * fit, logo.naturalHeight * fit);
    } else text(g, "NUS", 104, 145, 28, BLUE, 700);
    text(g, "NUS STUDENTS’ COMPUTING CLUB", 194, 125, 25, BLUE, 700, 830);
    text(g, "WELCOME TEA  /  COMMIT-TEA.", 194, 160, 20, "#697181", 500);
    g.strokeStyle = "#d8dce2"; g.lineWidth = 2; g.beginPath(); g.moveTo(104, 204); g.lineTo(1046, 204); g.stroke();
    text(g, "CERTIFICATE OF ACHIEVEMENT", 104, 270, 21, "#697181", 700);
    text(g, "BUG", 98, 383, 108, BLUE, 700);
    text(g, "SQUASHER", 98, 490, 108, BLUE, 700, 960);
    roundRect(g, 104, 518, 67, 6, 3, GOLD);
    text(g, "Proudly awarded to", 104, 583, 25, "#697181", 500);
    const displayName = String(name || "Anonymous squasher").trim() || "Anonymous squasher";
    text(g, displayName, 100, 668, 76, INK, 700, 930);
    g.strokeStyle = "#d8dce2"; g.lineWidth = 2; g.beginPath(); g.moveTo(104, 697); g.lineTo(1046, 697); g.stroke();
    text(g, "For finding the fault, applying the patch, and proving the fix", 104, 747, 25, INK, 500, 930);
    text(g, "at the Computing Club Welcome Tea.", 104, 784, 25, INK, 500, 930);
    text(g, "ISSUED", 104, 859, 17, "#697181", 700);
    text(g, String(date || ""), 104, 893, 23, INK, 500, 490);
    text(g, "VENUE", 680, 859, 17, "#697181", 700);
    text(g, String(venue || ""), 680, 893, 23, INK, 500, 365);
    g.textAlign = "center";
    text(g, "HALL OF FAME", 1340, 143, 22, GOLD, 700);
    text(g, `#${rank}`, 1340, 235, 78, "#fffdf8", 700, 310);
    g.fillStyle = GOLD; g.beginPath(); g.arc(1340, 480, 166, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff8e8"; g.beginPath(); g.arc(1340, 480, 154, 0, Math.PI * 2); g.fill();
    g.textAlign = "left";
    bugSeal(g, 1340, 467);
    g.textAlign = "center";
    text(g, "FOUND. FIXED. VERIFIED.", 1340, 720, 20, "#fffdf8", 700, 350);
    g.strokeStyle = "#4d5a72"; g.lineWidth = 2; g.beginPath(); g.moveTo(1180, 775); g.lineTo(1500, 775); g.stroke();
    text(g, "COMMIT-TEA. REPAIR LAB", 1340, 826, 18, "#c5cfdb", 500, 330);
    text(g, `CARD ${code}`, 1340, 871, 20, GOLD, 700, 330);
    g.textAlign = "left";

    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PNG")), "image/png"));
  }
  root.BugCertificate = { create };
})(typeof window === "undefined" ? globalThis : window);
