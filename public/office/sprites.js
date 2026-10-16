export const FONT = '"OfficeUI","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif';
const INK = "#5c4a68";

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function blob(ctx, draw, fill, stroke = INK) {
  ctx.beginPath();
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function eye(ctx, x, y, look) {
  ctx.fillStyle = "#fff";
  roundRect(ctx, x - 4, y - 4, 8, 8, 3);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#2d2438";
  ctx.beginPath();
  ctx.arc(x + look, y + 0.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function feet(ctx, color, spread = 8) {
  blob(ctx, () => roundRect(ctx, -spread - 5, -8, 10, 8, 3), color);
  blob(ctx, () => roundRect(ctx, spread - 5, -8, 10, 8, 3), color);
}

function paintAnimal(ctx, animal, look) {
  const styles = {
    cat: { body: "#f7b7cc", belly: "#ffe4ee", ear: "#f7b7cc", inner: "#f38aab" },
    dog: { body: "#f3d2a2", belly: "#fff0d8", ear: "#e7b678", inner: "#f6d7b0" },
    rabbit: { body: "#fff7fb", belly: "#fff", ear: "#fff7fb", inner: "#f7b7cc" },
    bear: { body: "#e7c09a", belly: "#f8e6cf", ear: "#d7a97e", inner: "#f0c8a4" },
    fox: { body: "#ffb067", belly: "#fff4e8", ear: "#ffb067", inner: "#ff8d7a" },
    panda: { body: "#fff", belly: "#fff", ear: "#2c2a33", inner: "#5c4a68" },
    penguin: { body: "#3e4a66", belly: "#fff", ear: "#3e4a66", inner: "#ffb067" },
    frog: { body: "#8ed48a", belly: "#e7f8c9", ear: "#8ed48a", inner: "#fff" },
  };
  const style = styles[animal] || styles.cat;
  if (animal === "penguin") {
    feet(ctx, "#f2b14d", 7);
    blob(ctx, () => roundRect(ctx, -16, -40, 32, 34, 14), style.body);
    blob(ctx, () => roundRect(ctx, -10, -32, 20, 22, 10), style.belly);
    blob(ctx, () => roundRect(ctx, -4, -18, 10, 6, 2), "#f2b14d");
    eye(ctx, -6, -30, look);
    eye(ctx, 6, -30, look);
    return;
  }
  if (animal === "frog") {
    feet(ctx, "#6fba78", 10);
    blob(ctx, () => roundRect(ctx, -18, -28, 36, 22, 11), style.body);
    blob(ctx, () => roundRect(ctx, -10, -22, 20, 12, 6), style.belly);
    blob(ctx, () => {
      ctx.arc(-10, -34, 7, 0, Math.PI * 2);
    }, "#fff");
    blob(ctx, () => {
      ctx.arc(10, -34, 7, 0, Math.PI * 2);
    }, "#fff");
    ctx.fillStyle = "#2d2438";
    ctx.beginPath();
    ctx.arc(-10 + look * 0.4, -34, 3, 0, Math.PI * 2);
    ctx.arc(10 + look * 0.4, -34, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -16, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    return;
  }
  feet(ctx, animal === "panda" ? "#2c2a33" : style.body, 8);
  if (animal === "rabbit") {
    blob(ctx, () => roundRect(ctx, -14, -62, 10, 26, 6), style.ear);
    blob(ctx, () => roundRect(ctx, 4, -62, 10, 26, 6), style.ear);
    blob(ctx, () => roundRect(ctx, -11, -58, 4, 16, 3), style.inner);
    blob(ctx, () => roundRect(ctx, 7, -58, 4, 16, 3), style.inner);
  } else if (animal === "dog") {
    blob(ctx, () => roundRect(ctx, -22, -40, 12, 16, 6), style.ear);
    blob(ctx, () => roundRect(ctx, 10, -40, 12, 16, 6), style.ear);
  } else if (animal === "fox") {
    blob(ctx, () => {
      ctx.moveTo(-16, -34);
      ctx.lineTo(-8, -58);
      ctx.lineTo(0, -34);
    }, style.ear);
    blob(ctx, () => {
      ctx.moveTo(16, -34);
      ctx.lineTo(8, -58);
      ctx.lineTo(0, -34);
    }, style.ear);
  } else {
    const earW = animal === "bear" || animal === "panda" ? 12 : 10;
    blob(ctx, () => {
      ctx.moveTo(-16, -36);
      ctx.lineTo(-11, -54);
      ctx.lineTo(-16 + earW, -34);
    }, style.ear);
    blob(ctx, () => {
      ctx.moveTo(16, -36);
      ctx.lineTo(11, -54);
      ctx.lineTo(16 - earW, -34);
    }, style.ear);
    if (animal === "cat" || animal === "fox" || animal === "bear") {
      ctx.fillStyle = style.inner;
      ctx.beginPath();
      ctx.moveTo(-13, -38);
      ctx.lineTo(-11, -48);
      ctx.lineTo(-7, -38);
      ctx.moveTo(13, -38);
      ctx.lineTo(11, -48);
      ctx.lineTo(7, -38);
      ctx.fill();
    }
  }
  blob(ctx, () => roundRect(ctx, -15, -32, 30, 24, 12), style.body);
  blob(ctx, () => roundRect(ctx, -9, -26, 18, 14, 7), style.belly);
  blob(ctx, () => {
    ctx.arc(0, -40, animal === "bear" ? 16 : 15, 0, Math.PI * 2);
  }, animal === "fox" ? "#ffc48a" : style.body);
  if (animal === "panda") {
    ctx.fillStyle = "#2c2a33";
    roundRect(ctx, -14, -46, 10, 8, 3);
    ctx.fill();
    roundRect(ctx, 4, -46, 10, 8, 3);
    ctx.fill();
  }
  if (animal === "fox") {
    blob(ctx, () => roundRect(ctx, -8, -36, 16, 10, 5), "#fff");
  }
  eye(ctx, -6, -42, look);
  eye(ctx, 6, -42, look);
  ctx.fillStyle = animal === "cat" ? "#f28aaa" : animal === "dog" ? "#e0897a" : "#f2a0b0";
  ctx.beginPath();
  ctx.arc(-11, -36, 2.2, 0, Math.PI * 2);
  ctx.arc(11, -36, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = animal === "dog" ? "#5c4a68" : "#f28aaa";
  ctx.beginPath();
  if (animal === "dog") ctx.ellipse(0, -34, 2.2, 1.6, 0, 0, Math.PI * 2);
  else ctx.moveTo(-2, -35), ctx.lineTo(2, -35), ctx.lineTo(0, -32);
  ctx.fill();
  if (animal === "cat") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-16, -36);
    ctx.lineTo(-24, -38);
    ctx.moveTo(-16, -33);
    ctx.lineTo(-24, -33);
    ctx.moveTo(16, -36);
    ctx.lineTo(24, -38);
    ctx.moveTo(16, -33);
    ctx.lineTo(24, -33);
    ctx.stroke();
  }
  if (animal === "dog") {
    ctx.fillStyle = "#f28aaa";
    roundRect(ctx, 2, -31, 6, 4, 2);
    ctx.fill();
  }
}

function paintAccessories(ctx, accessories) {
  const acc = accessories || { hat: "none", glasses: "none", extra: "none" };
  if (acc.extra === "scarf") {
    blob(ctx, () => roundRect(ctx, -12, -30, 24, 8, 4), "#f28aaa");
    blob(ctx, () => roundRect(ctx, 2, -26, 7, 12, 3), "#f28aaa");
  } else if (acc.extra === "bowtie") {
    ctx.fillStyle = "#7d8fd6";
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(-8, -33);
    ctx.lineTo(-8, -23);
    ctx.moveTo(0, -28);
    ctx.lineTo(8, -33);
    ctx.lineTo(8, -23);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-2, -30, 4, 4);
  } else if (acc.extra === "headphones") {
    ctx.strokeStyle = "#6b8cae";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -42, 16, Math.PI, 0);
    ctx.stroke();
    blob(ctx, () => roundRect(ctx, -20, -46, 6, 12, 2), "#6b8cae");
    blob(ctx, () => roundRect(ctx, 14, -46, 6, 12, 2), "#6b8cae");
  }
  if (acc.glasses === "round") {
    ctx.strokeStyle = "#5c4a68";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-6, -42, 5, 0, Math.PI * 2);
    ctx.arc(6, -42, 5, 0, Math.PI * 2);
    ctx.moveTo(-1, -42);
    ctx.lineTo(1, -42);
    ctx.stroke();
  } else if (acc.glasses === "sun") {
    ctx.fillStyle = "#3d4a66";
    roundRect(ctx, -12, -46, 11, 8, 2);
    ctx.fill();
    roundRect(ctx, 1, -46, 11, 8, 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-1, -42);
    ctx.lineTo(1, -42);
    ctx.stroke();
  }
  if (acc.hat === "beanie") {
    blob(ctx, () => roundRect(ctx, -14, -56, 28, 12, 6), "#8eb7e8");
    blob(ctx, () => {
      ctx.arc(0, -58, 5, 0, Math.PI * 2);
    }, "#fff");
  } else if (acc.hat === "ribbon") {
    ctx.fillStyle = "#f28aaa";
    ctx.beginPath();
    ctx.moveTo(8, -52);
    ctx.lineTo(18, -58);
    ctx.lineTo(18, -46);
    ctx.moveTo(8, -52);
    ctx.lineTo(-2, -58);
    ctx.lineTo(-2, -46);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, -52, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (acc.hat === "flower") {
    ctx.fillStyle = "#f7a8c4";
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(10 + Math.cos(angle) * 4, -54 + Math.sin(angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(10, -54, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (acc.hat === "crown") {
    ctx.fillStyle = "#ffe08a";
    ctx.strokeStyle = "#c9a15b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, -48);
    ctx.lineTo(-12, -60);
    ctx.lineTo(-6, -52);
    ctx.lineTo(0, -62);
    ctx.lineTo(6, -52);
    ctx.lineTo(12, -60);
    ctx.lineTo(12, -48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

export function drawAnimal(ctx, animal, accessories, x, y, opt = {}) {
  const moving = Boolean(opt.moving);
  const frame = opt.frame || 0;
  const look = (opt.dir || 1) > 0 ? 1.4 : -1.4;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.translate(0, Math.sin(frame) * (moving ? 1.5 : 0.35));
  ctx.fillStyle = "rgba(80, 60, 100, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, -1, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  paintAnimal(ctx, animal, look);
  paintAccessories(ctx, accessories);
  ctx.restore();
}

export function drawKiki(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.translate(0, Math.sin(frame * 0.6) * 0.6);
  ctx.fillStyle = "rgba(80, 60, 100, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, -1, 12, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, () => roundRect(ctx, -11, -30, 22, 22, 8), "#9fe0d2");
  blob(ctx, () => roundRect(ctx, -9, -32, 18, 10, 4), "#fffaf6");
  blob(ctx, () => {
    ctx.arc(0, -44, 13, 0, Math.PI * 2);
  }, "#ffe1cc");
  blob(ctx, () => roundRect(ctx, -15, -58, 30, 18, 8), "#f4a4c0");
  blob(ctx, () => roundRect(ctx, -16, -46, 8, 16, 4), "#f4a4c0");
  blob(ctx, () => roundRect(ctx, 8, -46, 8, 16, 4), "#f4a4c0");
  eye(ctx, -5, -46, 1);
  eye(ctx, 5, -46, 1);
  ctx.fillStyle = "#f28aaa";
  ctx.beginPath();
  ctx.arc(-9, -41, 2, 0, Math.PI * 2);
  ctx.arc(9, -41, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -40, 3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  roundRect(ctx, -8, -28, 16, 8, 2);
  ctx.fill();
  ctx.strokeStyle = "#f4a4c0";
  ctx.strokeRect(-8.5, -28.5, 17, 9);
  ctx.fillStyle = "#f4a4c0";
  ctx.font = `700 7px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("KIKI", 0, -22);
  ctx.restore();
}

function drawMonitor(ctx, x, y, w, h) {
  ctx.fillStyle = "#d9d3e4";
  roundRect(ctx, x + w / 2 - 4, y + h - 6, 8, 6, 1);
  ctx.fill();
  blob(ctx, () => roundRect(ctx, x, y, w, h - 4, 3), "#4d5670");
  const screen = ctx.createLinearGradient(x, y, x, y + h);
  screen.addColorStop(0, "#c9f1ff");
  screen.addColorStop(1, "#ffd6ea");
  ctx.fillStyle = screen;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 10, 2);
  ctx.fill();
  ctx.fillStyle = "#f28aaa";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2 - 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawKeyboard(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 3), "#ece7f6");
  ctx.fillStyle = "#c9c0da";
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) ctx.fillRect(x + 3 + col * 4.5, y + 2 + row * 5, 3, 3);
  }
}

function drawMouse(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 5), "#f7f3fb");
  ctx.strokeStyle = "#c9c0da";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 2);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.stroke();
}

function drawChair(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x + 4, y, w - 8, 8, 3), "#f4a4c0");
  blob(ctx, () => roundRect(ctx, x, y + 6, w, h - 8, 6), "#f7c6d8");
}

function drawPlant(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x + 4, y + h - 12, w - 8, 12, 3), "#e7a07a");
  ctx.fillStyle = "#7dce96";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 12, 8, 0, Math.PI * 2);
  ctx.arc(x + 7, y + 16, 6, 0, Math.PI * 2);
  ctx.arc(x + w - 7, y + 16, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawLamp(ctx, x, y, w, h) {
  ctx.strokeStyle = "#d7b07a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 10);
  ctx.lineTo(x + w / 2, y + h - 4);
  ctx.stroke();
  blob(ctx, () => roundRect(ctx, x + 2, y + h - 6, w - 4, 6, 2), "#e7c39a");
  blob(ctx, () => {
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w, y + 12);
  }, "#ffe08a");
}

function drawCoffee(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y + 6, w, h - 6, 4), "#d7a48a");
  blob(ctx, () => roundRect(ctx, x + 4, y, 10, 8, 2), "#fff");
  ctx.fillStyle = "#8d6e63";
  ctx.fillRect(x + w - 8, y + 12, 4, 8);
}

function drawWater(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x + 2, y + h - 10, w - 4, 10, 2), "#9bb0c4");
  blob(ctx, () => roundRect(ctx, x + 4, y, w - 8, h - 8, 6), "#c5e7fb");
  ctx.fillStyle = "#7ec8ea";
  roundRect(ctx, x + 7, y + 6, w - 14, h - 20, 4);
  ctx.fill();
}

function drawConsole(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 4), "#6d6a8e");
  ctx.fillStyle = "#f28aaa";
  ctx.fillRect(x + 4, y + 5, 6, 6);
  ctx.fillStyle = "#8ed48a";
  ctx.fillRect(x + 12, y + 5, 6, 6);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(x + 20, y + 5, 6, 6);
}

function drawSpeaker(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 4), "#5c5670");
  ctx.fillStyle = "#d7d2e4";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2 + 2, Math.min(w, h) / 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawSofa(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 8), "#f4b6c8");
  blob(ctx, () => roundRect(ctx, x + 4, y + 4, w - 8, h * 0.55, 6), "#ffd6e6");
  ctx.strokeStyle = "#e7a0b8";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 4);
  ctx.lineTo(x + w / 2, y + h - 4);
  ctx.stroke();
}

function drawBin(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y + 4, w, h - 4, 2), "#d5dbe3");
  blob(ctx, () => roundRect(ctx, x - 1, y, w + 2, 5, 2), "#c5ced8");
}

function drawShelf(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 3), "#e7c39a");
  const colors = ["#f4a4c0", "#8eb7e8", "#8ed48a", "#ffe08a", "#c9b6e8"];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + 4 + i * 8, y + 4, 6, h - 8);
  }
}

function drawBoard(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x, y, w, h, 3), "#fff");
  ctx.strokeStyle = "#8eb7e8";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#f4a4c0";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 12);
  ctx.bezierCurveTo(x + 16, y + 4, x + 24, y + 20, x + w - 8, y + 10);
  ctx.stroke();
}

function drawCactus(ctx, x, y, w, h) {
  blob(ctx, () => roundRect(ctx, x + 4, y + h - 10, w - 8, 10, 2), "#e7a07a");
  blob(ctx, () => roundRect(ctx, x + w / 2 - 4, y + 6, 8, h - 14, 4), "#7dce96");
  blob(ctx, () => roundRect(ctx, x, y + 10, 8, 4, 2), "#7dce96");
  blob(ctx, () => roundRect(ctx, x + w - 8, y + 14, 8, 4, 2), "#7dce96");
  ctx.fillStyle = "#f4a4c0";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 6, 3, 0, Math.PI * 2);
  ctx.fill();
}

const FURNITURE_DRAW = {
  monitor: drawMonitor,
  keyboard: drawKeyboard,
  mouse: drawMouse,
  chair: drawChair,
  plant: drawPlant,
  lamp: drawLamp,
  coffee: drawCoffee,
  water: drawWater,
  console: drawConsole,
  speaker: drawSpeaker,
  sofa: drawSofa,
  bin: drawBin,
  shelf: drawShelf,
  board: drawBoard,
  cactus: drawCactus,
};

export function drawFurniture(ctx, item, spec) {
  const baseW = spec?.w || 32;
  const baseH = spec?.h || 24;
  const rot = ((item.rot || 0) % 360 + 360) % 360;
  const swapped = rot % 180 !== 0;
  const w = swapped ? baseH : baseW;
  const h = swapped ? baseW : baseH;
  ctx.save();
  ctx.translate(item.x + w / 2, item.y + h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  const draw = FURNITURE_DRAW[item.kind];
  if (draw) draw(ctx, -baseW / 2, -baseH / 2, baseW, baseH);
  else {
    blob(ctx, () => roundRect(ctx, -baseW / 2, -baseH / 2, baseW, baseH, 4), "#efe7f8");
  }
  ctx.restore();
}

export function drawProp(ctx, prop) {
  const { x, y, w, h, kind } = prop;
  if (kind === "desk") {
    ctx.fillStyle = "rgba(90,70,50,0.12)";
    ctx.fillRect(x + 8, y + h - 4, w - 16, 6);
    blob(ctx, () => roundRect(ctx, x, y, w, h, 6), "#e7b56d");
    ctx.fillStyle = "#f3d7a2";
    roundRect(ctx, x + 4, y + 4, w - 8, 10, 3);
    ctx.fill();
    ctx.fillStyle = "#fffaf6";
    roundRect(ctx, x + w / 2 - 10, y + h / 2 - 7, 20, 14, 3);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(prop.label || "", x + w / 2, y + h / 2 + 4);
  } else if (kind === "counter") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 6), "#f4a4c0");
    ctx.fillStyle = "#fff";
    roundRect(ctx, x + 8, y + 6, w - 16, h - 12, 4);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(x + w - 28, y + h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("櫃檯", x + w / 2 - 8, y + h / 2 + 4);
  } else if (kind === "table") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 18), "#e7c39a");
    ctx.fillStyle = "#fff";
    roundRect(ctx, x + 16, y + 14, 28, 18, 3);
    ctx.fill();
    ctx.fillStyle = "#d7e4ff";
    roundRect(ctx, x + w - 52, y + 18, 30, 16, 3);
    ctx.fill();
  } else if (kind === "arcade") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 6), "#6a5ac4");
    const screen = ctx.createLinearGradient(x, y, x, y + 30);
    screen.addColorStop(0, "#9cf0ff");
    screen.addColorStop(1, "#f7b7cc");
    ctx.fillStyle = screen;
    roundRect(ctx, x + 6, y + 8, w - 12, 28, 3);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(x + 14, y + h - 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f28aaa";
    ctx.beginPath();
    ctx.arc(x + w - 14, y + h - 16, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "stall") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 4), prop.tint || "#e7f3ff");
    ctx.fillStyle = "#fff";
    roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 3);
    ctx.fill();
    ctx.fillStyle = "#9ec9ef";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2 + 4, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "pantry") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 4), "#f2d2a8");
    ctx.fillStyle = "#fff6ea";
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 8 + i * 28, y + 6, 20, h - 12);
  } else if (kind === "coffeetable") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 8), "#e7c39a");
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + w / 2 - 10, y + h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d7f0ea";
    ctx.beginPath();
    ctx.arc(x + w / 2 + 12, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "rug") {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = prop.tint || "#f8c3d6";
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.restore();
  } else if (kind === "window") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 3), "#d7f1ff");
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w / 2, y + h - 2);
    ctx.moveTo(x + 2, y + h / 2);
    ctx.lineTo(x + w - 2, y + h / 2);
    ctx.stroke();
  } else if (kind === "sign") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 6), "#fffaf6");
    ctx.fillStyle = INK;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(prop.label || "", x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  } else if (kind === "mirror") {
    blob(ctx, () => roundRect(ctx, x, y, w, h, 10), "#f7e7c5");
    ctx.fillStyle = "#dff4ff";
    roundRect(ctx, x + 4, y + 3, w - 8, h - 6, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(x + 8, y + 6, 4, h - 12);
  }
}
