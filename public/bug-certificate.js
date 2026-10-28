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
  // A flattened ladybug under a stomping foot, on a gold splat. Centre at (x, y), about 330px wide.
  function stomp(g, x, y, scale = 1) {
    g.save(); g.translate(x, y); g.scale(scale, scale);
    // splat
    g.fillStyle = "#ffe08a";
    g.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = i % 2 ? 62 : 92 + (i % 3) * 10;
      const px = Math.cos(a) * r * 1.35, py = Math.sin(a) * r * 0.55 + 60;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    for (const [dx, dy, r] of [[-150, 40, 9], [140, 95, 7], [160, 30, 5], [-120, 110, 6]]) {
      g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill();
    }
    // squashed ladybug: legs, then a wide flat shell
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = "round";
    for (const side of [-1, 1]) for (const k of [-1, 0, 1]) {
      g.beginPath(); g.moveTo(side * 40, 62 + k * 10); g.lineTo(side * 95, 50 + k * 26); g.lineTo(side * 112, 58 + k * 30); g.stroke();
    }
    g.fillStyle = INK; g.beginPath(); g.ellipse(-62, 60, 22, 15, 0, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = "#ff605c"; g.beginPath(); g.ellipse(8, 62, 72, 26, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.moveTo(8, 36); g.lineTo(8, 88); g.stroke();
    g.fillStyle = INK;
    for (const [dx, dy] of [[-22, 52], [32, 54], [-12, 74], [44, 72], [12, 60]]) { g.beginPath(); g.arc(dx, dy, 6, 0, Math.PI * 2); g.fill(); }
    // x x eyes
    g.strokeStyle = "#fff"; g.lineWidth = 3;
    for (const ex of [-70, -56]) { g.beginPath(); g.moveTo(ex - 4, 55); g.lineTo(ex + 4, 63); g.moveTo(ex + 4, 55); g.lineTo(ex - 4, 63); g.stroke(); }
    // motion lines and the foot
    g.strokeStyle = BLUE; g.lineWidth = 6;
    for (const [lx, top] of [[-62, -98], [-84, -66], [62, -98], [84, -66]]) { g.beginPath(); g.moveTo(lx, top); g.lineTo(lx, top + 28); g.stroke(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '112px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.save(); g.translate(4, -40); g.rotate(-0.12); g.fillText("\u{1F9B6}", 0, 0); g.restore();
    // stamp
    g.save(); g.translate(132, -46); g.rotate(-0.16);
    g.strokeStyle = "#d64541"; g.lineWidth = 4; roundPath(g, -92, -24, 184, 48, 8); g.stroke();
    g.font = '700 30px "DM Sans", Arial, sans-serif'; g.fillStyle = "#d64541"; g.fillText("SQUASHED!", 0, 2);
    g.restore();
    g.textAlign = "left"; g.textBaseline = "alphabetic";
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
    stomp(g, 1310, 478, 0.72);
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
