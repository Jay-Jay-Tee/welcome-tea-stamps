// Wing icons and the donut progress drawing, shared by every page.
// Icons are 24x24 line drawings. Add one here and name it in config/event.json.
(function () {
  const ICONS = {
    crown: '<path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10.5H5z"/><path d="M5 19h14"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.1c2.9.4 5 2.8 5 5.9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3.5 9h17M3.5 15h17"/>',
    party: '<path d="M4 20l4.5-11.5 7 7z"/><path d="M13 3.5c.8 1.2.8 2.5 0 3.7M17.5 6.5l1.8-1.8M20.5 11c-1.2-.8-2.5-.8-3.7 0M15 9l.01 0"/>',
    sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4-3-6.5-7.5-6.5 0 4 3 6.5 7.5 6.5z"/><path d="M12 11c0-3.8 2.7-6.5 7.5-6.5 0 4-3 6.5-7.5 6.5z"/>',
    donut: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M7 8l1 .5M15.5 6.5l.5 1M17 14l1 .3M9 16.5l-.3 1"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  };

  const icon = (name, size = 24, color = "currentColor", width = 2) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.star}</svg>`;

  // Dark ink on light colours (yellow, sky blue), white on dark ones (Club blue), so icons stay readable.
  const inkOn = (hex) => {
    const n = parseInt(String(hex || "#365486").slice(1), 16);
    const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1f2a44" : "#ffffff";
  };

  // Text-safe version of a colour: light ones (yellow) get darkened so they read on white.
  const readable = (hex) => {
    if (inkOn(hex) === "#ffffff") return hex;
    const n = parseInt(String(hex).slice(1), 16);
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.6).toString(16).padStart(2, "0")).join("");
  };

  // The donut is the progress bar: one icing segment per stamp, sprinkles in the colours of the stalls visited.
  function donut(filled, total, colors, size = 180, freshFrom = filled) {
    const c = 90, R = 62, seg = 360 / total, gap = total > 1 ? 7 : 0;
    const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
    const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    let icing = "", sprinkles = "";
    for (let i = 0; i < total; i++) {
      const a0 = i * seg + gap / 2, a1 = (i + 1) * seg - gap / 2;
      const on = i < filled;
      icing += `<path class="icing ${on ? "on" : ""} ${on && i >= freshFrom ? "fresh" : ""}" d="${arc(a0, a1, R)}"/>`;
      if (!on) continue;
      // Fixed positions per segment, so sprinkles don't jump around on every refresh.
      for (let k = 0; k < 4; k++) {
        const a = a0 + (a1 - a0) * (0.18 + 0.22 * k), r = R + [-9, 6, -3, 9][k];
        const [x, y] = pt(a, r);
        sprinkles += `<rect x="${(x - 4).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="8" height="3" rx="1.5" fill="${colors[(i + k) % colors.length] || "#fff"}" transform="rotate(${(a * 3 + k * 47) % 180} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }
    }
    return `<svg class="donut" viewBox="0 0 180 180" width="${size}" height="${size}" role="img" aria-label="${filled} of ${total} stamps">
      <circle cx="90" cy="90" r="${R}" fill="none" stroke="#e9b872" stroke-width="46"/>
      <g fill="none" stroke-width="34" stroke-linecap="round">${icing}</g>
      ${sprinkles}
      <circle cx="90" cy="90" r="85" fill="none" stroke="#1f2a44" stroke-width="2.5"/>
      <circle cx="90" cy="90" r="39" fill="#fff" stroke="#1f2a44" stroke-width="2.5"/>
      <text x="90" y="98" text-anchor="middle" class="donut-count">${filled}/${total}</text>
    </svg>`;
  }

  window.Look = { ICONS, icon, inkOn, readable, donut };
})();
