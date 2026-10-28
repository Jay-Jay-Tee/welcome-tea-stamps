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
  function donut(g, x, y, scale = 1) {
    g.save(); g.translate(x, y); g.rotate(-0.18); g.scale(scale, scale);
    g.fillStyle = "#a65c38";
    g.beginPath(); g.arc(6, 11, 130, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d89255";
    g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f59bb8";
    g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,.65)"; g.lineWidth = 8; g.lineCap = "round";
    g.beginPath(); g.arc(0, 0, 100, -2.65, -1.45); g.stroke();
    const colors = [GOLD, BLUE, "#fff", "#5aa9e6", "#3fae5a"];
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399;
      const radius = 65 + (i % 3) * 15;
      g.save(); g.translate(Math.cos(angle) * radius, Math.sin(angle) * radius); g.rotate(angle);
      roundRect(g, -12, -3, 24, 6, 3, colors[i % colors.length]); g.restore();
    }
    g.restore();
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
    g.fillStyle = "#eef3f9"; g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = "#dbe5f0";
    for (let y = 24; y < 1000; y += 28) for (let x = 24; x < 1600; x += 28) {
      g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
    }
    roundRect(g, 90, 77, 1430, 870, 28, BLUE);
    roundRect(g, 70, 57, 1430, 870, 28, "#fffdf8");
    g.strokeStyle = INK; g.lineWidth = 5; roundPath(g, 70, 57, 1430, 870, 28); g.stroke();
    roundRect(g, 70, 57, 20, 870, 10, GOLD);

    // Club mark and rank make it feel like an event memento rather than a form.
    if (logo.naturalWidth) g.drawImage(logo, 121, 108, 86, 86);
    else {
      g.fillStyle = BLUE; g.beginPath(); g.arc(164, 151, 43, 0, Math.PI * 2); g.fill();
      g.textAlign = "center"; text(g, "NUS", 164, 161, 25, "#fff", 700);
      g.textAlign = "left";
    }
    text(g, "NUS STUDENTS' COMPUTING CLUB", 229, 146, 27, BLUE, 700);
    text(g, "WELCOME TEA  /  COMMIT-TEA.", 229, 182, 22, "#5b6677", 500);
    roundRect(g, 1198, 111, 236, 82, 16, "#fff2cc");
    text(g, `HALL OF FAME  #${rank}`, 1221, 162, 26, INK, 700, 193);
    g.strokeStyle = "#c5cfdb"; g.lineWidth = 2; g.beginPath(); g.moveTo(132, 228); g.lineTo(1435, 228); g.stroke();

    text(g, "OFFICIAL BUG HUNT CERTIFICATE", 140, 300, 25, "#5b6677", 700);
    text(g, "BUG SQUASHER", 137, 408, 91, BLUE, 700, 950);
    text(g, "PATCH APPLIED. TESTS PASSED.", 141, 466, 31, INK, 700);
    donut(g, 1300, 352, 0.78);

    // Keep the playful squash scene as a small seal in the right column.
    stomp(g, 1262, 590, 0.62);

    text(g, "Proudly awarded to", 142, 577, 30, "#5b6677", 500);
    const displayName = String(name || "Anonymous squasher");
    const nameWidth = text(g, displayName, 139, 665, 79, INK, 700, 900);
    const underlineWidth = Math.min(nameWidth + 18, displayName.length * 50, 900);
    g.strokeStyle = GOLD; g.lineWidth = 8; g.beginPath(); g.moveTo(142, 689); g.lineTo(142 + underlineWidth, 689); g.stroke();
    text(g, "For finding the hidden donut bug and repairing it at the Computing Club Welcome Tea.", 142, 751, 28, INK, 500, 1170);
    g.strokeStyle = "#c5cfdb"; g.lineWidth = 2; g.beginPath(); g.moveTo(132, 806); g.lineTo(1435, 806); g.stroke();
    text(g, `${date}  |  ${venue}`, 142, 859, 25, "#5b6677", 500, 850);
    text(g, `CARD ${code}`, 1160, 859, 24, BLUE, 700, 276);

    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PNG")), "image/png"));
  }
  root.BugCertificate = { create };
})(typeof window === "undefined" ? globalThis : window);
