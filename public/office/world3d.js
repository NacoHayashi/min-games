import * as THREE from "./vendor/three.module.js";

const TILE = 32;
const WALL_H = 36;
const WALL_T = 12;
const CREATURE = 2.35;
const ISO_PITCH = 0.78;
const FOLLOW_PITCH = Math.PI / 2 - (30 * Math.PI) / 180;
const BODY_R = 11.2;
const BODY_STRETCH = 1.3;
const BODY_CENTER = 17.6;
const FACE_LIFT = 9.06;
const BODY_SHAPES = {
  mochi: { id: "mochi", radius: 12.4, stretch: 1.02, top: 1.14, bottom: 1.14, center: 16.4 },
  bean: { id: "bean", radius: 11.2, stretch: 1.3, top: 1.06, bottom: 1.26, center: 17.6 },
  pear: { id: "pear", radius: 11.0, stretch: 1.2, top: 0.8, bottom: 1.52, center: 16.8 },
  wide: { id: "wide", radius: 13.1, stretch: 0.9, top: 1.36, bottom: 1.44, center: 15.2 },
};
const FACE_W = 16.2;
const FACE_H = 10.6;

const FALLBACK_LOOK = {
  v: 2,
  body: "bean",
  ears: "point",
  tail: "thin",
  belly: true,
  eyes: "highlight",
  mouth: "omega",
  blush: "oval",
  marking: "none",
  head: "none",
  face: "none",
  neck: "none",
  held: "none",
  colors: {
    body: "#f06292",
    ear: "#f06292",
    inner: "#d81b60",
    tip: "#ad1457",
    belly: "#ffe4ef",
    tail: "#f06292",
    blush: "#ff709c",
  },
};
const BODY_RADIUS = { mochi: 33, bean: 31, pear: 31, wide: 43 };
const CHAIR_R = 18;

function bodyRadius(look) {
  const id = look?.body || "bean";
  return BODY_RADIUS[id] || BODY_RADIUS.bean;
}

const KIKI_LOOK = {
  ...FALLBACK_LOOK,
  head: "ribbon",
  colors: { ...FALLBACK_LOOK.colors, body: "#ff4d88", ear: "#ff4d88", tail: "#ff4d88" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createWorld({ view, preview, labels, fallback }) {
  const world = {
    ok: false,
    previewOk: false,
    mode: "iso",
    yaw: -0.72,
    heading: -0.72,
    pitch: ISO_PITCH,
    dist: 500,
    followDist: 230,
    followPitch: FOLLOW_PITCH,
    yawOffset: 0,
    face: 0,
  };
  let renderer;
  let previewRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    showFallback();
    return stub();
  }
  if (!renderer.getContext()) {
    showFallback();
    return stub();
  }
  world.ok = true;
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xf6e7f4, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6e7f4);
  scene.fog = new THREE.Fog(0xf6e7f4, 520, 1500);
  const camera = new THREE.PerspectiveCamera(40, 1, 6, 4000);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let snapped = false;

  scene.add(new THREE.AmbientLight(0xfff3e8, 0.42));
  const hemi = new THREE.HemisphereLight(0xfff6ee, 0xe7d3c4, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1df, 0.95);
  sun.position.set(180, 420, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.28;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xffd0c8, 0.32);
  fill.position.set(-160, 180, 240);
  scene.add(fill);

  const gradient = toonGradient();
  const softGradient = softToonGradient();
  const mats = new Map();
  const geos = new Map();
  const root = new THREE.Group();
  scene.add(root);
  const floorGroup = new THREE.Group();
  const wallGroup = new THREE.Group();
  const propGroup = new THREE.Group();
  const furnGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  root.add(floorGroup, wallGroup, propGroup, furnGroup, actorGroup);

  const walls = [];
  const furnMeshes = new Map();
  const actors = new Map();
  const floaters = new Map();
  const auras = new Map();
  let auraDisc = null;
  let auraRing = null;
  let builtMap = null;
  let previewActor = null;
  let previewScene = null;
  let previewCamera = null;

  function ensurePreview() {
    if (previewRenderer || !(preview instanceof HTMLCanvasElement)) return;
    try {
      previewRenderer = new THREE.WebGLRenderer({ canvas: preview, antialias: true, alpha: true });
      if (!previewRenderer.getContext()) throw new Error("preview webgl");
      world.previewOk = true;
      previewRenderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      previewRenderer.setClearColor(0xfff6fb, 1);
      previewScene = new THREE.Scene();
      previewScene.add(new THREE.HemisphereLight(0xfff4e8, 0xf0d0e4, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 0.7);
      key.position.set(40, 80, 60);
      previewScene.add(key);
      previewCamera = new THREE.PerspectiveCamera(28, 1, 1, 500);
      previewCamera.position.set(0, 58, 188);
      previewCamera.lookAt(0, 40, 0);
    } catch {
      previewRenderer = null;
      world.previewOk = false;
    }
  }

  function showFallback() {
    if (fallback) fallback.hidden = false;
  }

  function stub() {
    const rectOf = () => view.getBoundingClientRect();
    return {
      ok: false,
      previewOk: false,
      mode: "iso",
      resize() {},
      sync() {},
      preview() {},
      radius() { return 31; },
      nudge() {},
      gap() { return null; },
      orbit() {},
      zoom() {},
      aim() {},
      toggle() {},
      axes() {
        return { forwardX: 0, forwardY: -1, rightX: 1, rightY: 0 };
      },
      screenToWorld(clientX, clientY) {
        const rect = rectOf();
        return { x: clientX - rect.left, y: clientY - rect.top };
      },
      worldToScreen(x, y) {
        const rect = rectOf();
        return { x: rect.left + x, y: rect.top + y };
      },
    };
  }

  function mat(color, extra = {}) {
    const key = `${color}|${extra.basic ? 1 : 0}|${extra.transparent ? 1 : 0}|${extra.opacity ?? 1}|${extra.emissive || 0}|${extra.vertexColors ? 1 : 0}|${extra.mapName || ""}|${extra.soft ? 1 : 0}|${extra.side || 0}`;
    let material = mats.get(key);
    if (material) return material;
    if (extra.basic) {
      material = new THREE.MeshBasicMaterial({
        color,
        map: extra.map || null,
        transparent: Boolean(extra.transparent),
        opacity: extra.opacity ?? 1,
        depthWrite: extra.depthWrite !== false,
        side: extra.side || THREE.FrontSide,
      });
    } else {
      material = new THREE.MeshToonMaterial({
        color,
        gradientMap: extra.soft ? softGradient : gradient,
        emissive: extra.emissive || 0x000000,
        emissiveIntensity: extra.emissive ? 0.45 : 0,
        vertexColors: Boolean(extra.vertexColors),
        transparent: Boolean(extra.transparent),
        opacity: extra.opacity ?? 1,
      });
    }
    mats.set(key, material);
    return material;
  }

  function geo(key, build) {
    let value = geos.get(key);
    if (!value) {
      value = build();
      geos.set(key, value);
    }
    return value;
  }

  function roundedBox(w, h, d, radius = 4) {
    const r = Math.max(0.4, Math.min(radius, w / 2 - 0.2, d / 2 - 0.2, h / 2));
    return geo(`rb|${w}|${h}|${d}|${r}`, () => {
      const shape = new THREE.Shape();
      const x = -w / 2;
      const z = -d / 2;
      shape.moveTo(x + r, z);
      shape.lineTo(x + w - r, z);
      shape.quadraticCurveTo(x + w, z, x + w, z + r);
      shape.lineTo(x + w, z + d - r);
      shape.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
      shape.lineTo(x + r, z + d);
      shape.quadraticCurveTo(x, z + d, x, z + d - r);
      shape.lineTo(x, z + r);
      shape.quadraticCurveTo(x, z, x + r, z);
      const extruded = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 2 });
      extruded.translate(0, 0, -h / 2);
      extruded.rotateX(-Math.PI / 2);
      return extruded;
    });
  }

  function ownMaterials(object) {
    object.traverse((node) => {
      if (!node.isMesh || node.userData.owned) return;
      const material = node.material.clone();
      node.material = material;
      node.userData.owned = true;
      node.userData.baseOpacity = material.opacity;
      node.userData.baseTransparent = material.transparent;
      node.userData.baseDepthWrite = material.depthWrite;
    });
  }

  function setFade(object, faded) {
    object.traverse((node) => {
      if (!node.isMesh || Boolean(node.userData.faded) === faded) return;
      node.userData.faded = faded;
      const material = node.material;
      if (!faded) {
        material.opacity = node.userData.baseOpacity ?? 1;
        material.transparent = Boolean(node.userData.baseTransparent);
        material.depthWrite = node.userData.baseDepthWrite !== false;
      } else {
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = 0.13 * (node.userData.baseOpacity ?? 1);
      }
      material.needsUpdate = true;
    });
  }

  function contactShadow(parent, rx, rz) {
    const mesh = new THREE.Mesh(
      geo(`blob|${rx}|${rz}`, () => new THREE.CircleGeometry(1, 18)),
      mat(0x6d5348, { basic: true, transparent: true, opacity: 0.2, depthWrite: false, mapName: "shadow" }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rx, rz, 1);
    mesh.position.y = 0.45;
    parent.add(mesh);
    return mesh;
  }

  function rugMesh(width, depth, tint) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 108, 108);
    ctx.strokeStyle = "rgba(120,70,80,0.25)";
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 88, 88);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function floorStyle(zone) {
    const id = zone?.id || "hall";
    const table = {
      office: ["wood", 0xffffff],
      hall: ["wood", 0xfff4e4],
      reception: ["wood", 0xffe4d8],
      men: ["tile", 0xe7f6ff],
      women: ["tile", 0xffe4f0],
      pantry: ["tile", 0xfff0d4],
      sofa: ["carpet", 0xe5f6ea],
      meeting: ["carpet", 0xe4e7ff],
      game: ["carpet", 0xf0e4ff],
    };
    const entry = table[id] || ["wood", 0xfff6ea];
    return { key: `${entry[0]}|${id}`, map: floorTextures[entry[0]], tint: entry[1] };
  }

  function addMesh(parent, geometry, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = Boolean(opts.cast);
    mesh.receiveShadow = opts.receive !== false;
    if (opts.sx || opts.sy || opts.sz) mesh.scale.set(opts.sx || 1, opts.sy || 1, opts.sz || 1);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    parent.add(mesh);
    return mesh;
  }

  function patternTexture(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (kind === "wood") {
      ctx.fillStyle = "#f2d2a6";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? "rgba(150, 96, 48, 0.16)" : "rgba(255, 246, 230, 0.28)";
        ctx.fillRect(0, i * 32, 128, 30);
        ctx.fillStyle = "rgba(110, 68, 32, 0.28)";
        ctx.fillRect(0, i * 32 + 30, 128, 2);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(10, i * 32 + 8, 46, 2);
      }
    } else if (kind === "tile") {
      ctx.fillStyle = "#e7f3f0";
      ctx.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          ctx.fillStyle = (x + y) % 2 ? "rgba(255,255,255,0.45)" : "rgba(150, 180, 176, 0.18)";
          ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 3;
          ctx.strokeRect(x * 64 + 4, y * 64 + 4, 56, 56);
        }
      }
    } else {
      ctx.fillStyle = "#efe4f2";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 4) * 0.03})`;
        ctx.beginPath();
        ctx.arc((i * 41) % 128, (i * 29) % 128, 5 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const floorTextures = {
    wood: patternTexture("wood"),
    tile: patternTexture("tile"),
    carpet: patternTexture("carpet"),
  };

  function buildFloor(map) {
    const buckets = new Map();
    const color = new THREE.Color();
    for (let ty = 0; ty < map.rows; ty++) {
      for (let tx = 0; tx < map.cols; tx++) {
        if (map.walls[ty]?.[tx] === "1") continue;
        const zone = (map.zones || []).find((item) => tx >= item.x && ty >= item.y && tx < item.x + item.w && ty < item.y + item.h);
        const style = floorStyle(zone);
        let bucket = buckets.get(style.key);
        if (!bucket) {
          bucket = { positions: [], colors: [], uvs: [], style };
          buckets.set(style.key, bucket);
        }
        let shade = 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (map.walls[ty + dy]?.[tx + dx] === "1") shade = 0.84;
        }
        color.setHex(style.tint);
        color.multiplyScalar(shade);
        const x0 = tx * TILE;
        const z0 = ty * TILE;
        const x1 = x0 + TILE;
        const z1 = z0 + TILE;
        const y = 0;
        bucket.positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
        const u0 = x0 / 96;
        const v0 = z0 / 96;
        const u1 = x1 / 96;
        const v1 = z1 / 96;
        bucket.uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        for (let i = 0; i < 6; i++) bucket.colors.push(color.r, color.g, color.b);
      }
    }
    for (const bucket of buckets.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, mat(0xffffff, {
        vertexColors: true,
        map: bucket.style.map,
        mapName: bucket.style.key,
      }));
      mesh.receiveShadow = true;
      floorGroup.add(mesh);
    }
    for (const zone of map.zones || []) {
      if (zone.id === "hall") continue;
      floorGroup.add(zoneLabel(zone));
    }
  }

  function zoneLabel(zone) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(84, 62, 54, 0.55)";
    ctx.font = "800 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(zone.name, 256, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(zone.w * TILE * 0.62, 200), 36),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    // Tip the plane onto the floor, then yaw it so the top of the glyphs
    // points toward the top of the default overhead view.
    mesh.rotation.order = "YXZ";
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.y = world.yaw;
    mesh.position.set((zone.x + zone.w / 2) * TILE, 0.9, (zone.y + zone.h * 0.42) * TILE);
    return mesh;
  }

  function wallRuns(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const used = Array.from({ length: rows }, () => Array(cols).fill(false));
    const runs = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== "1" || used[y][x]) continue;
        let x1 = x;
        while (x1 + 1 < cols && grid[y][x1 + 1] === "1" && !used[y][x1 + 1]) x1 += 1;
        let y1 = y;
        if (x1 === x) {
          while (y1 + 1 < rows && grid[y1 + 1][x] === "1" && !used[y1 + 1][x]) y1 += 1;
        }
        for (let yy = y; yy <= y1; yy++) {
          for (let xx = x; xx <= x1; xx++) used[yy][xx] = true;
        }
        runs.push({ x, y, w: x1 - x + 1, h: y1 - y + 1 });
      }
    }
    return runs;
  }

  function buildWalls(map) {
    const plaster = mat(0xf4e4d4);
    const trim = mat(0xe2c2a4);
    const cap = mat(0xf8efe4);
    for (const run of wallRuns(map.walls)) {
      const alongX = run.w >= run.h;
      const span = (alongX ? run.w : run.h) * TILE;
      const thick = Math.min(WALL_T, (alongX ? run.h : run.w) * TILE - 4);
      const width = alongX ? Math.max(8, span - 4) : thick;
      const depth = alongX ? thick : Math.max(8, span - 4);
      const mesh = new THREE.Mesh(roundedBox(width, WALL_H, depth, 3), plaster);
      const cx = run.x * TILE + (run.w * TILE) / 2;
      const cz = run.y * TILE + (run.h * TILE) / 2;
      mesh.position.set(cx, WALL_H / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const skirt = new THREE.Mesh(roundedBox(width + 1.2, 7, depth + 1.2, 2), trim);
      skirt.position.set(0, -WALL_H / 2 + 3.5, 0);
      mesh.add(skirt);
      const lip = new THREE.Mesh(roundedBox(width + 0.6, 3.2, depth + 0.6, 1.5), cap);
      lip.position.set(0, WALL_H / 2 - 1.6, 0);
      mesh.add(lip);
      mesh.userData.occlude = true;
      ownMaterials(mesh);
      wallGroup.add(mesh);
      walls.push({
        mesh,
        h: WALL_H,
        minX: cx - width / 2,
        maxX: cx + width / 2,
        minZ: cz - depth / 2,
        maxZ: cz + depth / 2,
      });
    }
  }

  function textPlane(label, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff8f3";
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = "#e7b4cb";
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = "#6a4a68";
    ctx.font = "700 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  }

  function buildProps(map) {
    for (const prop of map.props || []) {
      propGroup.add(makeProp(prop));
    }
  }

  function makeProp(prop) {
    const group = new THREE.Group();
    const cx = prop.x + prop.w / 2;
    const cz = prop.y + prop.h / 2;
    let occlude = true;
    if (prop.kind === "desk") {
      contactShadow(group, prop.w * 0.42, prop.h * 0.46);
      addMesh(group, roundedBox(prop.w - 8, 5, prop.h - 10, 3), mat(0xf3d2b0), 0, 24, 0, { cast: true, receive: true });
      addMesh(group, geo("deskLeg", () => new THREE.CylinderGeometry(2.2, 2.6, 22, 8)), mat(0xd7b48a), -prop.w * 0.36, 12, -prop.h * 0.22, { cast: true });
      addMesh(group, geo("deskLeg", () => new THREE.CylinderGeometry(2.2, 2.6, 22, 8)), mat(0xd7b48a), prop.w * 0.36, 12, -prop.h * 0.22, { cast: true });
      addMesh(group, geo("deskLeg", () => new THREE.CylinderGeometry(2.2, 2.6, 22, 8)), mat(0xd7b48a), -prop.w * 0.36, 12, prop.h * 0.22, { cast: true });
      addMesh(group, geo("deskLeg", () => new THREE.CylinderGeometry(2.2, 2.6, 22, 8)), mat(0xd7b48a), prop.w * 0.36, 12, prop.h * 0.22, { cast: true });
    } else if (prop.kind === "counter") {
      contactShadow(group, prop.w * 0.46, prop.h * 0.7);
      addMesh(group, roundedBox(prop.w - 4, 26, prop.h + 8, 6), mat(0xf7c6d6), 0, 16, 0, { cast: true });
      addMesh(group, roundedBox(prop.w - 16, 4, prop.h, 3), mat(0xfff7fb), 0, 31, 0);
    } else if (prop.kind === "table") {
      contactShadow(group, prop.w * 0.4, prop.h * 0.4);
      addMesh(group, roundedBox(prop.w - 10, 6, prop.h - 10, 8), mat(0xd5def8), 0, 22, 0, { cast: true });
      addMesh(group, geo("leg", () => new THREE.CylinderGeometry(2.4, 3, 20, 8)), mat(0xcbbce4), -prop.w / 2 + 18, 11, -prop.h / 2 + 16, { cast: true });
      addMesh(group, geo("leg", () => new THREE.CylinderGeometry(2.4, 3, 20, 8)), mat(0xcbbce4), prop.w / 2 - 18, 11, prop.h / 2 - 16, { cast: true });
    } else if (prop.kind === "arcade") {
      contactShadow(group, prop.w * 0.4, prop.h * 0.36);
      const body = prop.use === "play" ? 0xc9b6f2 : 0xb9a6e6;
      addMesh(group, roundedBox(prop.w - 6, 58, prop.h * 0.62, 6), mat(body), 0, 32, -2, { cast: true });
      addMesh(group, roundedBox(prop.w - 10, 10, prop.h * 0.28, 4), mat(0x6a5488), 0, 18, prop.h * 0.22, { cast: true });
      addMesh(group, roundedBox(prop.w - 16, 18, 2.4, 2), mat(0x241c30), 0, 48, prop.h * 0.16);
      addMesh(group, roundedBox(prop.w - 20, 12, 1.6, 2), mat(0x9ae6ff, { emissive: 0x7ad4ff }), 0, 48, prop.h * 0.2);
      addMesh(group, roundedBox(prop.w - 14, 6, 3, 2), mat(0xffe08a, { emissive: 0xffc85a }), 0, 62, prop.h * 0.12);
    } else if (prop.kind === "scoreboard") {
      contactShadow(group, prop.w * 0.4, 10);
      addMesh(group, roundedBox(8, 36, 8, 2), mat(0xc9b18a), -prop.w * 0.32, 18, 0, { cast: true });
      addMesh(group, roundedBox(8, 36, 8, 2), mat(0xc9b18a), prop.w * 0.32, 18, 0, { cast: true });
      addMesh(group, roundedBox(prop.w, 32, 4, 3), mat(0xfff8f1), 0, 40, 0, { cast: true });
      const board = textPlane(prop.label || "排行榜", prop.w - 8, 18);
      board.position.set(0, 42, 3);
      group.add(board);
    } else if (prop.kind === "stall") {
      contactShadow(group, prop.w * 0.42, prop.h * 0.4);
      addMesh(group, roundedBox(prop.w - 4, 40, prop.h - 8, 4), mat(prop.tint || 0xd7ecff), 0, 20, 0, { cast: true });
      addMesh(group, roundedBox(prop.w * 0.46, 26, 2.4, 2), mat(0xfffdfb), 0, 16, prop.h * 0.28);
    } else if (prop.kind === "mirror") {
      addMesh(group, roundedBox(prop.w, 22, 3, 3), mat(0xf4e2c4), 0, 36, 0, { cast: true });
      addMesh(group, roundedBox(prop.w - 6, 14, 1.4, 2), mat(0xd7f4ff, { emissive: 0xc6ecff }), 0, 36, 2);
      occlude = false;
    } else if (prop.kind === "rug") {
      const rug = rugMesh(prop.w, prop.h, prop.tint || "#f8c3d6");
      rug.position.y = 0.7;
      group.add(rug);
      occlude = false;
    } else if (prop.kind === "window") {
      addMesh(group, roundedBox(prop.w, 22, 3, 3), mat(0xfff4e6), 0, 40, 0);
      addMesh(group, roundedBox(prop.w - 8, 14, 1.4, 2), mat(0xd9f3ff, { emissive: 0xc8ebff }), 0, 40, 2);
      occlude = false;
    } else if (prop.kind === "sign") {
      const sign = textPlane(prop.label || "", prop.w, 18);
      sign.position.set(0, 34, 0);
      group.add(sign);
      occlude = false;
    } else if (prop.kind === "pantry") {
      contactShadow(group, prop.w * 0.46, prop.h * 0.6);
      addMesh(group, roundedBox(prop.w, 28, prop.h + 6, 4), mat(0xf6d7a4), 0, 16, 0, { cast: true });
      addMesh(group, roundedBox(prop.w - 10, 10, 3, 2), mat(0xfff8ee), 0, 34, prop.h * 0.2);
    } else if (prop.kind === "coffeetable") {
      contactShadow(group, prop.w * 0.4, prop.h * 0.4);
      addMesh(group, roundedBox(prop.w - 4, 6, prop.h - 4, 6), mat(0xf0d2ae), 0, 14, 0, { cast: true });
    } else {
      addMesh(group, roundedBox(prop.w, 16, prop.h, 4), mat(0xe6d4c8), 0, 8, 0, { cast: true });
    }
    group.position.set(cx, 0, cz);
    group.userData.occlude = occlude;
    if (occlude) ownMaterials(group);
    return group;
  }

  function itemSize(item, specs) {
    const spec = specs.get(item.kind);
    if (!spec) return { w: 32, h: 24 };
    const rot = ((item.rot || 0) % 360 + 360) % 360;
    if (rot % 180 !== 0) return { w: spec.h, h: spec.w };
    return { w: spec.w, h: spec.h };
  }

  function makeFurniture(item) {
    const group = new THREE.Group();
    const kind = item.kind;
    if (kind === "monitor") {
      contactShadow(group, 16, 12);
      addMesh(group, geo("neck", () => new THREE.CylinderGeometry(1.6, 2, 14, 8)), mat(0xd9c8b4), 0, 33, 0, { cast: true });
      addMesh(group, roundedBox(34, 22, 3.4, 3), mat(0xf7f4ef), 0, 48, 0, { cast: true });
      addMesh(group, roundedBox(28, 16, 1.2, 2), mat(0xb7e4ff, { emissive: 0x8fd0ff }), 0, 48, 2.2);
    } else if (kind === "keyboard") {
      addMesh(group, roundedBox(32, 2.4, 12, 2), mat(0xfffdfb), 0, 28.4, 0, { cast: true });
      addMesh(group, roundedBox(26, 1.2, 7, 1), mat(0xe7d8ea), 0, 30, 0);
    } else if (kind === "mouse") {
      addMesh(group, geo("mouse", () => new THREE.SphereGeometry(4.2, 12, 10)), mat(0xfffdfb), 0, 29, 0, { sx: 1, sy: 0.55, sz: 1.25, cast: true });
    } else if (kind === "chair") {
      contactShadow(group, 16, 16);
      const wheels = [];
      for (let i = 0; i < 5; i++) {
        const arm = new THREE.Group();
        arm.rotation.y = (i / 5) * Math.PI * 2;
        addMesh(arm, geo("casterArm", () => new THREE.BoxGeometry(11, 1.3, 2.1)), mat(0xcbb8a4), 5.6, 2.2, 0);
        const wheel = new THREE.Group();
        wheel.position.set(11.4, 1.7, 0);
        addMesh(wheel, geo("casterWheel", () => new THREE.CylinderGeometry(1.7, 1.7, 1.5, 12)), mat(0x3a3340), 0, 0, 0, { rotX: Math.PI / 2 });
        arm.add(wheel);
        group.add(arm);
        wheels.push(wheel);
      }
      addMesh(group, geo("chairGas", () => new THREE.CylinderGeometry(1.45, 1.8, 9, 12)), mat(0xe4dcd2), 0, 7.4, 0);
      const seat = new THREE.Group();
      group.add(seat);
      addMesh(seat, roundedBox(24, 5, 22, 5), mat(0xf4b7cc), 0, 14.5, 1, { cast: true });
      addMesh(seat, roundedBox(22, 15, 3.6, 3), mat(0xf7c4d4), 0, 22, -8, { cast: true });
      addMesh(seat, smoothSphere(1.5, 12, 10), mat(0xffe08a), 0, 30.2, -8);
      group.userData.wheels = wheels;
      group.userData.seatPivot = seat;
      group.userData.wobble = 0;
    } else if (kind === "plant" || kind === "cactus") {
      contactShadow(group, 12, 12);
      addMesh(group, geo("pot", () => new THREE.CylinderGeometry(7, 5.5, 10, 10)), mat(0xf0c49a), 0, 6, 0, { cast: true });
      const leaf = kind === "cactus" ? 0x7dca78 : 0x7ecf86;
      addMesh(group, geo("leaf", () => new THREE.SphereGeometry(10, 12, 10)), mat(leaf), 0, 20, 0, { cast: true });
      if (kind === "plant") {
        addMesh(group, geo("leaf", () => new THREE.SphereGeometry(8, 12, 10)), mat(0xb6e7a4), 7, 26, 2, { sx: 0.85, sy: 0.75, sz: 0.75 });
        addMesh(group, geo("leaf", () => new THREE.SphereGeometry(7, 12, 10)), mat(0x9edc98), -6, 24, -1, { sx: 0.8, sy: 0.7, sz: 0.7 });
      }
    } else if (kind === "lamp") {
      addMesh(group, geo("lampStem", () => new THREE.CylinderGeometry(1.5, 2, 18, 8)), mat(0xf2d7a4), 0, 12, 0);
      addMesh(group, geo("shade", () => new THREE.ConeGeometry(8, 10, 10)), mat(0xfff1c4, { emissive: 0xffe29a }), 0, 24, 0);
    } else if (kind === "coffee") {
      addMesh(group, roundedBox(18, 20, 16, 4), mat(0xd7b08a), 0, 12, 0, { cast: true });
      addMesh(group, geo("mug", () => new THREE.CylinderGeometry(4, 3.4, 6, 10)), mat(0xfffdfb), 0, 24, 0);
    } else if (kind === "water") {
      addMesh(group, roundedBox(16, 28, 16, 4), mat(0xd7f0ff), 0, 16, 0, { cast: true });
      addMesh(group, geo("bottle", () => new THREE.CylinderGeometry(5, 5, 10, 10)), mat(0xb7e4ff), 0, 32, 0);
    } else if (kind === "console") {
      addMesh(group, roundedBox(28, 6, 16, 3), mat(0xe7d2ff), 0, 6, 0);
    } else if (kind === "speaker") {
      addMesh(group, roundedBox(14, 24, 12, 4), mat(0x6a5a78), 0, 14, 0, { cast: true });
      addMesh(group, geo("speaker", () => new THREE.CircleGeometry(3.2, 12)), mat(0x2c2434), 0, 16, 6.2);
    } else if (kind === "sofa") {
      contactShadow(group, 34, 18);
      addMesh(group, roundedBox(66, 12, 30, 6), mat(0xf6c4d4), 0, 12, 2, { cast: true });
      addMesh(group, roundedBox(66, 18, 8, 4), mat(0xf3b4c8), 0, 24, -10, { cast: true });
      addMesh(group, roundedBox(8, 16, 28, 3), mat(0xf0a8c0), -30, 18, 2);
      addMesh(group, roundedBox(8, 16, 28, 3), mat(0xf0a8c0), 30, 18, 2);
      addMesh(group, roundedBox(16, 5, 12, 3), mat(0xfff6ea), -14, 20, 4);
      addMesh(group, roundedBox(16, 5, 12, 3), mat(0xffe0ea), 14, 20, 4);
    } else if (kind === "bin") {
      addMesh(group, geo("bin", () => new THREE.CylinderGeometry(6, 5, 12, 10)), mat(0xd5e0ea), 0, 6, 0);
    } else if (kind === "shelf") {
      addMesh(group, roundedBox(44, 28, 10, 3), mat(0xf0d2b0), 0, 18, 0, { cast: true });
      addMesh(group, roundedBox(36, 2, 8, 1), mat(0xfff6ea), 0, 22, 1);
    } else if (kind === "board") {
      addMesh(group, roundedBox(48, 28, 3, 2), mat(0xf7fbf7), 0, 28, 0, { cast: true });
      addMesh(group, roundedBox(40, 16, 1, 1), mat(0xd7f3df), 0, 28, 2);
    }
    const ring = new THREE.Mesh(geo("ring", () => new THREE.TorusGeometry(16, 1.1, 6, 18)), mat(0xf08aab, { basic: true }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.4;
    ring.visible = false;
    group.add(ring);
    group.userData.ring = ring;
    group.userData.kind = kind;
    group.userData.occlude = true;
    ownMaterials(group);
    return group;
  }

  function mochiGeometry(spec) {
    return geo(`mochi|${spec.id}`, () => {
      const geometry = new THREE.SphereGeometry(spec.radius, 64, 48);
      const attr = geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const p = deformMochi(spec, attr.getX(i), attr.getY(i), attr.getZ(i));
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      geometry.computeVertexNormals();
      return geometry;
    });
  }

  function smoothSphere(radius, width = 36, height = 28) {
    return geo(`ss|${radius}|${width}|${height}`, () => new THREE.SphereGeometry(radius, width, height));
  }

  function creatureMat(color) {
    return mat(color, { soft: true });
  }

  function faceShell(metrics) {
    const spec = metrics.spec;
    return geo(`faceShell|${spec.id}`, () => {
      const geometry = new THREE.PlaneGeometry(FACE_W, FACE_H, 22, 18);
      const attr = geometry.attributes.position;
      const tilt = 0.42;
      const cy = Math.cos(tilt);
      const sy = Math.sin(tilt);
      for (let i = 0; i < attr.count; i++) {
        const x = attr.getX(i);
        const y = attr.getY(i) + metrics.faceLift;
        const p = projectToMochi(spec, x, y);
        const ny = p.ny * cy + p.nz * sy;
        const nz = -p.ny * sy + p.nz * cy;
        const lift = 0.46;
        attr.setXYZ(i, p.x + p.nx * lift, p.y + ny * lift, p.z + nz * lift);
      }
      geometry.computeVertexNormals();
      return geometry;
    });
  }

  function bellyShell(metrics) {
    const spec = metrics.spec;
    return geo(`bellyShell|${spec.id}`, () => {
      const geometry = new THREE.PlaneGeometry(12.2, 6.4, 14, 8);
      const attr = geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const x = attr.getX(i);
        const y = attr.getY(i) - 10.6 * (metrics.half / (BODY_R * BODY_STRETCH));
        const p = projectToMochi(spec, x, y);
        const lift = 0.3;
        attr.setXYZ(i, p.x + p.nx * lift, p.y + p.ny * lift, p.z + p.nz * lift);
      }
      geometry.computeVertexNormals();
      return geometry;
    });
  }

  function cssColor(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const hex = value.trim().replace("#", "");
      if (/^[0-9a-fA-F]{6}$/.test(hex)) return Number.parseInt(hex, 16);
    }
    return fallback;
  }

  function styleFromLook(look, options = {}) {
    const src = look || {};
    const colors = src.colors || {};
    const body = cssColor(colors.body, 0xf06292);
    return {
      body: options.kiki ? 0xff4d88 : body,
      ear: cssColor(colors.ear, body),
      inner: cssColor(colors.inner, 0xd81b60),
      tip: cssColor(colors.tip, 0x4a1c0c),
      belly: cssColor(colors.belly, 0xfff1e4),
      tailColor: cssColor(colors.tail, body),
      blushColor: cssColor(colors.blush, 0xff709c),
      earKind: src.ears || "point",
      tail: src.tail || "thin",
      bellyOn: src.belly !== false,
      eyes: src.eyes || "highlight",
      mouth: src.mouth || "omega",
      blush: src.blush || "oval",
      marking: src.marking || "none",
      beak: src.mouth === "beak",
      bodyShape: src.body || "bean",
      head: options.kiki ? "ribbon" : (src.head || "none"),
      faceAcc: src.face || "none",
      neck: src.neck || "none",
      held: src.held || "none",
    };
  }

  function creature(look, options = {}) {
    const style = styleFromLook(look, options);
    const metrics = bodyMetrics(style.bodyShape);
    const spec = metrics.spec;
    const rootGroup = new THREE.Group();
    const rig = new THREE.Group();
    rootGroup.add(rig);
    const bodyGeo = mochiGeometry(spec);
    const body = addMesh(rig, bodyGeo, creatureMat(style.body), 0, spec.center, 0, { cast: true });
    const shell = new THREE.Mesh(bodyGeo, mat(liftColor(style.body), { basic: true, side: THREE.BackSide, mapName: `rim|${style.body}` }));
    shell.scale.setScalar(1.02);
    shell.position.copy(body.position);
    shell.renderOrder = 1;
    rig.add(shell);
    const footMat = creatureMat(style.ear);
    const footL = addMesh(rig, smoothSphere(2.6), footMat, -5.6 * metrics.spread, 2.25, 1.2, { sy: 0.55, cast: true });
    const footR = addMesh(rig, smoothSphere(2.6), footMat, 5.6 * metrics.spread, 2.25, 1.2, { sy: 0.55, cast: true });
    const armMat = creatureMat(style.body);
    const armY = 15 + metrics.shift * 0.45;
    const armL = addMesh(rig, smoothSphere(2.35), armMat, -13.6 * metrics.spread, armY, 1.2, { sx: 0.7, sy: 1.02, sz: 0.72 });
    const armR = addMesh(rig, smoothSphere(2.35), armMat, 13.6 * metrics.spread, armY, 1.2, { sx: 0.7, sy: 1.02, sz: 0.72 });
    if (style.beak) {
      armL.scale.set(1.15, 0.52, 0.68);
      armR.scale.set(1.15, 0.52, 0.68);
      armL.position.y = 16.2 + metrics.shift * 0.35;
      armR.position.y = 16.2 + metrics.shift * 0.35;
    }
    const face = makeFace(style, metrics);
    rig.add(face.mesh);
    if (style.bellyOn) rig.add(makeBelly(style, metrics));
    addEars(rig, style, metrics);
    addTail(rig, style, metrics);
    addAccessories(rig, style, metrics);
    const shadow = new THREE.Mesh(geo("shadow", () => new THREE.CircleGeometry(13, 24)), mat(0x000000, { basic: true, transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.55;
    rootGroup.add(shadow);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 56, 0);
    rootGroup.add(anchor);
    rootGroup.scale.setScalar(CREATURE);
    rootGroup.userData.rig = rig;
    rootGroup.userData.footL = footL;
    rootGroup.userData.footR = footR;
    rootGroup.userData.armL = armL;
    rootGroup.userData.armR = armR;
    rootGroup.userData.decal = face;
    rootGroup.userData.shadow = shadow;
    rootGroup.userData.anchor = anchor;
    paintFace(face, false, false);
    return rootGroup;
  }

  function makeFace(style, metrics) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(faceShell(metrics), material);
    mesh.position.set(0, metrics.spec.center, 0);
    mesh.renderOrder = 3;
    return { mesh, ctx, texture, style, blink: false, talking: false };
  }

  function makeBelly(style, metrics) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const strong = Boolean(style.beak);
    const color = hexCss(mixHex(style.body, style.belly, strong ? 0.88 : 0.42));
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = color;
    ctx.globalAlpha = strong ? 0.92 : 0.16;
    ctx.beginPath();
    ctx.ellipse(64, 72, strong ? 46 : 28, strong ? 30 : 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = strong ? 0.28 : 0.06;
    ctx.beginPath();
    ctx.ellipse(64, 68, 58, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(bellyShell(metrics), material);
    mesh.position.set(0, metrics.spec.center, 0);
    mesh.renderOrder = 2;
    return mesh;
  }

  function paintFace(face, blink, talking) {
    if (face.blink === blink && face.talking === talking && face.ready) return;
    face.blink = blink;
    face.talking = talking;
    face.ready = true;
    const ctx = face.ctx;
    const style = face.style;
    ctx.clearRect(0, 0, 256, 256);
    const eyeY = style.mouth === "wide" ? 104 : 112;
    const eyes = [88, 168];
    const blush = hexCss(style.blushColor);
    if (style.blush === "oval") {
      ctx.fillStyle = blush;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(46, eyeY + 4, 15, 11, -0.2, 0, Math.PI * 2);
      ctx.ellipse(210, eyeY + 4, 15, 11, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (style.blush === "round") {
      ctx.fillStyle = blush;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(48, eyeY + 6, 12, 0, Math.PI * 2);
      ctx.arc(208, eyeY + 6, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (style.blush === "lines") {
      ctx.strokeStyle = blush;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (const x of [40, 210]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x - 10, eyeY + i * 7);
          ctx.lineTo(x + 12, eyeY + 4 + i * 7);
          ctx.stroke();
        }
      }
    }
    if (style.marking === "panda") {
      ctx.fillStyle = "#1a1a22";
      for (const x of eyes) {
        ctx.beginPath();
        ctx.ellipse(x, eyeY + 2, 30, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style.marking === "freckles") {
      ctx.fillStyle = "#c47a5a";
      for (const [x, y] of [[58, eyeY + 16], [70, eyeY + 24], [186, eyeY + 16], [198, eyeY + 24]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style.marking === "spot") {
      ctx.fillStyle = "#5c4038";
      ctx.beginPath();
      ctx.ellipse(128, eyeY - 36, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const rx = style.mouth === "wide" ? 24 : 19;
    ctx.fillStyle = "#1a1214";
    ctx.strokeStyle = "#1a1214";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (const x of eyes) {
      if (blink || style.eyes === "line" || style.eyes === "sleepy") {
        ctx.beginPath();
        ctx.moveTo(x - rx, eyeY);
        ctx.quadraticCurveTo(x, eyeY + (style.eyes === "sleepy" ? 8 : 2), x + rx, eyeY);
        ctx.stroke();
      } else if (style.eyes === "happy") {
        ctx.beginPath();
        ctx.moveTo(x - rx, eyeY + 6);
        ctx.quadraticCurveTo(x, eyeY - 16, x + rx, eyeY + 6);
        ctx.stroke();
      } else if (style.eyes === "sparkle") {
        ctx.beginPath();
        ctx.moveTo(x, eyeY - rx);
        ctx.lineTo(x + 6, eyeY);
        ctx.lineTo(x, eyeY + rx);
        ctx.lineTo(x - 6, eyeY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 2, eyeY - rx * 0.45, 4, rx * 0.9);
        ctx.fillStyle = "#1a1214";
      } else {
        const ry = rx;
        ctx.beginPath();
        ctx.ellipse(x, eyeY, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if (style.eyes === "highlight") {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x - rx * 0.28, eyeY - ry * 0.32, Math.max(3.2, rx * 0.22), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1a1214";
        }
      }
    }
    const mouthY = eyeY + 46;
    ctx.strokeStyle = "#5c4038";
    ctx.fillStyle = "#5c4038";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (talking && style.mouth !== "none" && style.mouth !== "beak") {
      ctx.ellipse(128, mouthY + 2, 9, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (style.mouth === "beak") {
      ctx.fillStyle = "#f0a050";
      ctx.moveTo(128, mouthY - 6);
      ctx.lineTo(114, mouthY + 10);
      ctx.lineTo(142, mouthY + 10);
      ctx.closePath();
      ctx.fill();
    } else if (style.mouth === "wide") {
      ctx.moveTo(104, mouthY);
      ctx.quadraticCurveTo(128, mouthY + 18, 152, mouthY);
      ctx.stroke();
    } else if (style.mouth === "smile") {
      ctx.moveTo(112, mouthY);
      ctx.quadraticCurveTo(128, mouthY + 14, 144, mouthY);
      ctx.stroke();
    } else if (style.mouth === "o") {
      ctx.ellipse(128, mouthY + 4, 8, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (style.mouth === "cat") {
      ctx.moveTo(108, mouthY + 2);
      ctx.quadraticCurveTo(118, mouthY + 12, 128, mouthY);
      ctx.quadraticCurveTo(138, mouthY + 12, 148, mouthY + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(112, mouthY + 8);
      ctx.lineTo(118, mouthY + 16);
      ctx.moveTo(144, mouthY + 8);
      ctx.lineTo(138, mouthY + 16);
      ctx.stroke();
    } else if (style.mouth === "omega") {
      ctx.moveTo(112, mouthY);
      ctx.quadraticCurveTo(120, mouthY + 11, 128, mouthY + 1);
      ctx.quadraticCurveTo(136, mouthY + 11, 144, mouthY);
      ctx.stroke();
    }
    face.texture.needsUpdate = true;
  }

  function coneEar(radius, height) {
    return geo(`coneEar|${radius}|${height}`, () => new THREE.ConeGeometry(radius, height, 3));
  }

  function addPointedEars(parent, spec) {
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * spec.x, spec.y, spec.z);
      ear.rotation.order = "YXZ";
      ear.rotation.y = Math.PI / 6;
      ear.rotation.x = -spec.tilt;
      ear.rotation.z = side * -spec.splay;
      parent.add(ear);
      addMesh(ear, coneEar(spec.radius, spec.height), creatureMat(spec.color), 0, spec.height / 2, 0);
      if (spec.tip) addMesh(ear, coneEar(spec.tip.radius, spec.tip.height), creatureMat(spec.tip.color), 0, spec.tip.y, spec.tip.z ?? 0.32);
      if (spec.inner) addMesh(ear, coneEar(spec.inner.radius, spec.inner.height), creatureMat(spec.inner.color), 0, spec.inner.y, spec.inner.z);
    }
  }

  function addEars(parent, style, metrics = { shift: 0, spread: 1 }) {
    const earMat = creatureMat(style.ear);
    const innerMat = creatureMat(style.inner);
    const spread = metrics.spread || 1;
    const shift = metrics.shift || 0;
    const px = (x) => x * spread;
    const py = (y) => y + shift;
    if (style.beak) {
      addMesh(parent, geo("beak", () => new THREE.ConeGeometry(1.7, 3.6, 5)), creatureMat(0xf0a050), 0, py(24.4), 11.6, { rotX: -Math.PI / 2 });
    }
    if (style.earKind === "fox") {
      addPointedEars(parent, {
        x: px(10.6), y: py(26.8), z: 0.4, radius: 4.3, height: 16.2, splay: 0.78, tilt: 0.12, color: style.ear,
        tip: { radius: 1.9, height: 8.0, y: 13.2, z: 0.28, color: style.tip || 0x4a1c0c },
        inner: { radius: 1.35, height: 6.2, y: 4.6, z: 1.55, color: style.inner },
      });
    } else if (style.earKind === "point") {
      addPointedEars(parent, {
        x: px(9.4), y: py(30.4), z: 0.6, radius: 2.35, height: 10.2, splay: 0.58, tilt: 0.16, color: style.ear,
        inner: { radius: 0.95, height: 4.8, y: 3.8, z: 1.05, color: style.inner },
      });
    } else if (style.earKind === "long") {
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(side * px(5.1), py(32.0), 0.5);
        ear.rotation.z = side * -0.28;
        ear.rotation.x = -0.2;
        parent.add(ear);
        addMesh(ear, geo("earLong", () => new THREE.CapsuleGeometry(2.05, 14.4, 6, 14)), earMat, 0, 9.25, 0);
        addMesh(ear, geo("earLongIn", () => new THREE.CapsuleGeometry(1.25, 10.4, 5, 12)), innerMat, 0, 9.5, 1.25);
      }
    } else if (style.earKind === "flop") {
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(side * px(10.6), py(28.6), 2.6);
        ear.rotation.z = side * 1.18;
        ear.rotation.x = 0.32;
        parent.add(ear);
        addMesh(ear, geo("dogEar", () => new THREE.CapsuleGeometry(2.2, 8.8, 5, 12)), earMat, 0, -5.4, 0);
        addMesh(ear, geo("dogEarIn", () => new THREE.CapsuleGeometry(1.15, 6.4, 4, 10)), innerMat, 0, -5.0, 0.95);
      }
    } else if (style.earKind === "round") {
      const panda = style.marking === "panda";
      const radius = panda ? 3.65 : 5.4;
      const y = panda ? 34.6 : 33.2;
      const x = panda ? 8.5 : 10.5;
      addMesh(parent, smoothSphere(radius, 28, 22), earMat, -px(x), py(y), 0.2, { sy: 0.92 });
      addMesh(parent, smoothSphere(radius, 28, 22), earMat, px(x), py(y), 0.2, { sy: 0.92 });
      addMesh(parent, smoothSphere(radius * 0.5, 20, 16), innerMat, -px(x), py(y) - 0.1, 2.1);
      addMesh(parent, smoothSphere(radius * 0.5, 20, 16), innerMat, px(x), py(y) - 0.1, 2.1);
    } else if (style.earKind === "nub") {
      addMesh(parent, smoothSphere(2.15, 16, 12), earMat, -px(6.4), py(31.4), 1.2);
      addMesh(parent, smoothSphere(2.15, 16, 12), earMat, px(6.4), py(31.4), 1.2);
      addMesh(parent, smoothSphere(1.15, 12, 10), innerMat, -px(6.4), py(31.6), 2.3);
      addMesh(parent, smoothSphere(1.15, 12, 10), innerMat, px(6.4), py(31.6), 2.3);
    }
  }

  function addTail(parent, style, metrics = { shift: 0, spread: 1 }) {
    const spread = metrics.spread || 1;
    const shift = metrics.shift || 0;
    const color = creatureMat(style.tailColor);
    if (style.tail === "bush") {
      addMesh(parent, smoothSphere(4.8, 28, 22), color, 11.2 * spread, 14.8 + shift * 0.4, -6.4);
      addMesh(parent, smoothSphere(4.1, 24, 18), color, 15.0 * spread, 20.2 + shift * 0.45, -1.2);
      addMesh(parent, smoothSphere(3.15, 20, 16), creatureMat(0xfffdf8), 17.4 * spread, 26.4 + shift * 0.5, 2.4);
    } else if (style.tail === "thin") {
      addMesh(parent, smoothSphere(2.1, 18, 14), color, -6.2 * spread, 14.2 + shift * 0.3, -11.4, { sx: 0.7, sy: 0.7, sz: 1.8 });
    } else if (style.tail === "curl") {
      addMesh(parent, smoothSphere(3.3, 28, 22), color, -3.4 * spread, 13.2 + shift * 0.3, -12.6);
    } else if (style.tail === "puff" || style.tail === "nub") {
      const radius = style.tail === "puff" ? 3.5 : 2.4;
      addMesh(parent, smoothSphere(radius, 24, 18), color, 0, 12.4 + shift * 0.25, -13.0);
    }
  }

  function addAccessories(parent, style, metrics = { shift: 0 }) {
    const hat = style.head;
    const glasses = style.faceAcc;
    const extra = style.neck;
    const shift = metrics.shift || 0;
    const hy = (y) => y + shift;
    if (hat === "beanie") addMesh(parent, smoothSphere(7.2, 28, 22), creatureMat(0x7aa6ee), 0, hy(33.6), 0.6, { sy: 0.58 });
    if (hat === "ribbon") {
      addMesh(parent, smoothSphere(3.1, 18, 14), creatureMat(0xf26d9a), -4.2, hy(35.2), 2.2, { sx: 1.5, sy: 0.72, sz: 0.48 });
      addMesh(parent, smoothSphere(3.1, 18, 14), creatureMat(0xf26d9a), 4.2, hy(35.2), 2.2, { sx: 1.5, sy: 0.72, sz: 0.48 });
      addMesh(parent, smoothSphere(1.5, 14, 12), creatureMat(0xffe08a), 0, hy(35.0), 2.8);
    }
    if (hat === "flower") {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        addMesh(parent, smoothSphere(1.9, 14, 12), creatureMat(0xffb3d1), Math.cos(a) * 3.0, hy(34.6) + Math.sin(a) * 1.3, 2.6);
      }
      addMesh(parent, smoothSphere(1.35, 12, 10), creatureMat(0xffe08a), 0, hy(34.6), 3.2);
    }
    if (hat === "crown") {
      addMesh(parent, geo("crownBand", () => new THREE.TorusGeometry(6.0, 0.6, 8, 20)), creatureMat(0xffd76a), 0, hy(34.2), 0.4, { rotX: Math.PI / 2 });
      addMesh(parent, geo("crownTip", () => new THREE.SphereGeometry(1.3, 16, 12)), creatureMat(0xffd76a), 0, hy(36.8), 0.6);
      addMesh(parent, geo("crownSide", () => new THREE.SphereGeometry(1.05, 14, 12)), creatureMat(0xffd76a), -3.8, hy(35.6), 0.5);
      addMesh(parent, geo("crownSide", () => new THREE.SphereGeometry(1.05, 14, 12)), creatureMat(0xffd76a), 3.8, hy(35.6), 0.5);
    }
    if (glasses === "round" || glasses === "sun") {
      const lens = glasses === "sun" ? mat(0x3a3550, { transparent: true, opacity: 0.72, mapName: "sun" }) : mat(0xd7f4ff, { transparent: true, opacity: 0.35, mapName: "lens" });
      const ring = mat(0x6a4a68, { mapName: "ring" });
      addMesh(parent, geo("lens", () => new THREE.TorusGeometry(1.55, 0.16, 8, 24)), ring, -2.63, hy(27.9), 9.15);
      addMesh(parent, geo("lens", () => new THREE.TorusGeometry(1.55, 0.16, 8, 24)), ring, 2.63, hy(27.9), 9.15);
      addMesh(parent, geo("bridge", () => new THREE.CylinderGeometry(0.12, 0.12, 2.0, 8)), ring, 0, hy(28.05), 9.1, { rotZ: Math.PI / 2 });
      addMesh(parent, geo("lensFill", () => new THREE.CircleGeometry(1.28, 22)), lens, -2.63, hy(27.9), 9.3);
      addMesh(parent, geo("lensFill", () => new THREE.CircleGeometry(1.28, 22)), lens, 2.63, hy(27.9), 9.3);
    }
    if (extra === "scarf") addMesh(parent, geo("scarf", () => new THREE.TorusGeometry(8.4, 1.25, 10, 22)), creatureMat(0xf08a6a), 0, 11.2 + shift * 0.35, 1.6, { rotX: Math.PI / 2.4 });
    if (extra === "bowtie") {
      addMesh(parent, smoothSphere(2.0, 14, 12), creatureMat(0x6a8fd6), -2.5, 14.6 + shift * 0.35, 12.6, { sx: 1.4, sy: 0.72, sz: 0.38 });
      addMesh(parent, smoothSphere(2.0, 14, 12), creatureMat(0x6a8fd6), 2.5, 14.6 + shift * 0.35, 12.6, { sx: 1.4, sy: 0.72, sz: 0.38 });
    }
    if (hat === "headphones") {
      addMesh(parent, geo("band", () => new THREE.TorusGeometry(8.6, 0.5, 8, 24)), mat(0x6a4a68), 0, hy(31.5), 0.2, { rotX: Math.PI / 2 });
      addMesh(parent, geo("earcup", () => new THREE.CylinderGeometry(2.4, 2.4, 1.7, 16)), creatureMat(0xf2b7cc), -13.2, hy(22.5), 0.4, { rotZ: Math.PI / 2 });
      addMesh(parent, geo("earcup", () => new THREE.CylinderGeometry(2.4, 2.4, 1.7, 16)), creatureMat(0xf2b7cc), 13.2, hy(22.5), 0.4, { rotZ: Math.PI / 2 });
    }
    if (style.held === "mug") {
      addMesh(parent, geo("mug", () => new THREE.CylinderGeometry(1.5, 1.35, 3.2, 12)), creatureMat(0xfff6ea), 12.4, 12.2, 6.4);
      addMesh(parent, geo("handle", () => new THREE.TorusGeometry(1.1, 0.22, 6, 12)), creatureMat(0xfff6ea), 14.2, 12.2, 6.4, { rotY: Math.PI / 2 });
    } else if (style.held === "balloon") {
      addMesh(parent, geo("string", () => new THREE.CylinderGeometry(0.08, 0.08, 10, 6)), mat(0x6a4a68), 11.5, 22, 4);
      addMesh(parent, smoothSphere(3.2, 16, 12), creatureMat(0xf26d9a), 11.5, 29.5, 4);
    }
  }

  function signature(look) {
    return JSON.stringify(look || {});
  }

  function ensureActor(id, look, kiki = false) {
    const sig = `${kiki ? "kiki" : "p"}|${signature(look)}`;
    let actor = actors.get(id);
    if (!actor || actor.userData.sig !== sig) {
      if (actor) actorGroup.remove(actor);
      actor = creature(look, { kiki });
      actor.userData.sig = sig;
      actors.set(id, actor);
      actorGroup.add(actor);
    }
    return actor;
  }

  function stepJelly(actor, dt) {
    const jelly = actor.userData.jelly;
    if (!jelly) return { sx: 0, sy: 0, sz: 0 };
    if (Math.abs(jelly.s) < 0.001 && Math.abs(jelly.v) < 0.01) return { sx: 0, sy: 0, sz: 0 };
    jelly.v += (-42 * jelly.s - 8.5 * jelly.v) * dt;
    jelly.s += jelly.v * dt;
    const ry = actor.userData.heading || 0;
    const lx = jelly.nx * Math.cos(ry) - jelly.nz * Math.sin(ry);
    const lz = jelly.nx * Math.sin(ry) + jelly.nz * Math.cos(ry);
    const s = jelly.s;
    return {
      sx: -s * lx * lx + s * 0.42 * (1 - lx * lx),
      sy: s * 0.5,
      sz: -s * lz * lz + s * 0.42 * (1 - lz * lz),
    };
  }

  function animateActor(actor, moving, time, moveFace, talking = false, dt = 0.016) {
    const rig = actor.userData.rig;
    const sitting = Boolean(actor.userData.sitting);
    const wave = Math.sin(time * (moving && !sitting ? 11 : 2.4));
    const squash = sitting ? 0 : moving ? Math.max(0, Math.sin(time * 11)) * 0.14 : wave * 0.035;
    const jelly = stepJelly(actor, dt);
    let sx = 1 + squash * 0.65 + jelly.sx;
    let sy = 1 - squash + jelly.sy;
    let sz = 1 + squash * 0.45 + jelly.sz;
    if (sitting) {
      sx *= 1.08;
      sy *= 0.74;
      sz *= 1.05;
    }
    rig.scale.set(sx, sy, sz);
    rig.rotation.x = sitting ? 0.08 : moving ? 0.14 : 0;
    if (sitting) {
      const dangle = Math.sin(time * 3);
      actor.userData.footL.position.y = -2.6;
      actor.userData.footR.position.y = -2.6;
      actor.userData.footL.position.z = 4.6 + dangle * 0.7;
      actor.userData.footR.position.z = 4.6 + Math.sin(time * 3 + 1.1) * 0.7;
    } else {
      actor.userData.footL.position.y = 2.25;
      actor.userData.footR.position.y = 2.25;
      actor.userData.footL.position.z = 1.2 + (moving ? Math.sin(time * 11) * 2.2 : 0);
      actor.userData.footR.position.z = 1.2 + (moving ? Math.sin(time * 11 + Math.PI) * 2.2 : 0);
    }
    if (actor.userData.armL) {
      const swing = moving && !sitting ? Math.sin(time * 11) * 0.55 : 0;
      actor.userData.armL.position.z = 1.2 + swing;
      actor.userData.armR.position.z = 1.2 - swing;
    }
    let heading = actor.userData.heading;
    if (heading == null || Number.isNaN(heading)) heading = moveFace || 0;
    if (moving) heading = moveFace ?? heading;
    else if (world.mode === "iso" && actor.userData.faceCamera !== false) {
      const target = world.yaw;
      const delta = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
      heading += delta * (1 - Math.exp(-3.4 * Math.max(0.001, dt)));
    } else if (actor.userData.faceCamera === false) {
      heading = moveFace ?? heading;
    }
    actor.userData.heading = heading;
    actor.rotation.y = heading;
    let phase = (time + Math.abs(heading)) % 4.2;
    if (phase < 0) phase += 4.2;
    if (actor.userData.decal) paintFace(actor.userData.decal, phase > 4.05, Boolean(talking));
  }

  function separateBodies(bodies) {
    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          let dx = b.x - a.x;
          let dz = b.z - a.z;
          let dist = Math.hypot(dx, dz);
          const min = (a.r + b.r) * 0.98;
          if (dist >= min) continue;
          if (dist < 0.001) { dx = 1; dz = 0; dist = 1; }
          const push = (min - dist) / dist;
          if (a.pin && b.pin) continue;
          if (a.pin) {
            b.x += dx * push;
            b.z += dz * push;
          } else if (b.pin) {
            a.x -= dx * push;
            a.z -= dz * push;
          } else {
            a.x -= dx * push * 0.5;
            a.z -= dz * push * 0.5;
            b.x += dx * push * 0.5;
            b.z += dz * push * 0.5;
          }
        }
      }
    }
  }

  function nudge(id, nx, nz) {
    const actor = actors.get(id);
    if (!actor) return;
    const now = performance.now();
    const jelly = actor.userData.jelly || { s: 0, v: 0, nx: 0, nz: 1, cool: 0 };
    if (now < jelly.cool) return;
    const len = Math.hypot(nx, nz) || 1;
    jelly.s = 0.22;
    jelly.v = 0;
    jelly.nx = nx / len;
    jelly.nz = nz / len;
    jelly.cool = now + 480;
    actor.userData.jelly = jelly;
  }

  function syncActors(state, time, dt) {
    const keep = new Set();
    if (state.map?.kiki) {
      const kiki = state.map.kiki;
      const actor = ensureActor("kiki", KIKI_LOOK, true);
      keep.add("kiki");
      actor.position.set(kiki.x, 0, kiki.y);
      if (actor.userData.heading == null) actor.userData.heading = Math.PI;
      animateActor(actor, false, time, actor.userData.heading, false, dt);
      actor.userData.label = { title: kiki.name || "Kiki 小姐", subtitle: kiki.title || "櫃檯", bubble: "" };
    }
    const people = [];
    if (state.me) people.push({ ...state.me, moving: Boolean(state.dirty || state.path?.length) });
    for (const other of state.others?.values?.() || []) {
      const moving = Math.hypot((other.tx ?? other.x) - other.x, (other.ty ?? other.y) - other.y) > 1.5;
      people.push({ ...other, moving });
    }
    const bodies = [];
    if (state.map?.kiki) {
      const kikiActor = actors.get("kiki");
      if (kikiActor) bodies.push({ actor: kikiActor, x: kikiActor.position.x, z: kikiActor.position.z, r: bodyRadius(KIKI_LOOK), pin: true });
    }
    for (const person of people) {
      const actor = ensureActor(person.id, person.look || FALLBACK_LOOK);
      keep.add(person.id);
      const prevX = actor.userData.px ?? person.x;
      const prevZ = actor.userData.pz ?? person.y;
      const dx = person.x - prevX;
      const dz = person.y - prevZ;
      if (person.moving && (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01)) actor.userData.face = Math.atan2(dx, dz);
      actor.userData.px = person.x;
      actor.userData.pz = person.y;
      actor.userData.sitting = Boolean(person.seat);
      const face = actor.userData.face ?? (person.dir === -1 ? Math.PI : 0);
      const hop = person.seat ? 11 : person.moving ? Math.abs(Math.sin(time * 11)) * 3.5 : 0;
      const radius = bodyRadius(person.look);
      const pinned = person.id === state.me?.id;
      let rx = pinned ? person.x : (actor.userData.rx ?? person.x);
      let rz = pinned ? person.y : (actor.userData.rz ?? person.y);
      if (!pinned) {
        const follow = 1 - Math.exp(-10 * Math.max(0.001, dt));
        rx += (person.x - rx) * follow;
        rz += (person.y - rz) * follow;
      }
      actor.userData.rx = rx;
      actor.userData.rz = rz;
      bodies.push({ actor, x: rx, z: rz, r: radius, pin: pinned, hop });
      const bubble = visibleBubble(state, person.id);
      animateActor(actor, person.moving && !person.seat, time + (person.id || "").length, face, Boolean(bubble.text), dt);
      if (person.id === state.me?.id) world.face = actor.userData.heading ?? face;
      actor.userData.label = { title: person.displayName || person.id, subtitle: `@${person.id}`, bubble };
    }
    separateBodies(bodies);
    for (const body of bodies) {
      if (!body.hop && body.hop !== 0) continue;
      body.actor.position.set(body.x, body.hop, body.z);
      body.actor.userData.rx = body.x;
      body.actor.userData.rz = body.z;
    }
    for (const [id, actor] of actors) {
      if (!keep.has(id)) {
        actorGroup.remove(actor);
        actors.delete(id);
        const floater = floaters.get(id);
        if (floater) {
          floater.remove();
          floaters.delete(id);
        }
      }
    }
    syncAuras(state);
  }

  function auraGeometries() {
    if (!auraDisc) {
      auraDisc = new THREE.CircleGeometry(22, 40);
      auraRing = new THREE.RingGeometry(16, 24, 40);
    }
    return { auraDisc, auraRing };
  }

  function syncAuras(state) {
    const want = new Set();
    const memberGroup = state.memberGroup;
    if (memberGroup) {
      for (const [id, group] of memberGroup) {
        const actor = actors.get(id);
        if (!actor) continue;
        want.add(id);
        let aura = auras.get(id);
        if (!aura) {
          const geos = auraGeometries();
          aura = new THREE.Group();
          const disc = new THREE.Mesh(geos.auraDisc, new THREE.MeshBasicMaterial({
            color: 0xe3c8fb,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide,
          }));
          const ring = new THREE.Mesh(geos.auraRing, new THREE.MeshBasicMaterial({
            color: 0xc084fc,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
            side: THREE.DoubleSide,
          }));
          disc.rotation.x = -Math.PI / 2;
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.35;
          aura.add(disc, ring);
          actorGroup.add(aura);
          auras.set(id, aura);
        }
        if (aura.userData.group !== group) {
          aura.userData.group = group;
          let hash = 0;
          for (const char of group) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
          const hue = 0.72 + (hash % 18) / 180;
          aura.children[0].material.color.setHSL(hue, 0.55, 0.78);
          aura.children[1].material.color.setHSL(hue, 0.6, 0.62);
        }
        aura.position.set(actor.position.x, 1.2, actor.position.z);
      }
    }
    for (const [id, aura] of auras) {
      if (want.has(id)) continue;
      actorGroup.remove(aura);
      for (const child of aura.children) child.material.dispose();
      auras.delete(id);
    }
  }

  function visibleBubble(state, id) {
    const live = state.bubbles?.get?.(id);
    const theirGroup = state.memberGroup?.get?.(id);
    const inMine = Boolean(state.whisper && theirGroup === state.whisper);
    if (theirGroup && !inMine) return { text: "對話中…", kind: "secret" };
    if (live?.text && live.whisper && inMine) return { text: live.text, kind: "whisper" };
    if (live?.text && !live.whisper) return { text: live.text, kind: "" };
    return { text: "", kind: "" };
  }

  function placeFloater(id, anchor, title, subtitle, bubble) {
    if (!labels) return;
    let node = floaters.get(id);
    if (!node) {
      node = document.createElement("div");
      node.className = "floater";
      node.innerHTML = '<div class="bubble"></div><div class="nametag"><b></b><small></small></div>';
      labels.appendChild(node);
      floaters.set(id, node);
    }
    node.dataset.id = id;
    node.querySelector("b").textContent = title || "";
    node.querySelector("small").textContent = subtitle || "";
    const info = bubble && typeof bubble === "object" ? bubble : { text: bubble || "", kind: "" };
    const bubbleNode = node.querySelector(".bubble");
    bubbleNode.hidden = !info.text;
    bubbleNode.classList.toggle("whisper", info.kind === "whisper");
    bubbleNode.classList.toggle("secret", info.kind === "secret");
    bubbleNode.replaceChildren();
    if (info.kind === "whisper") {
      const icon = document.createElement("span");
      icon.className = "shush";
      icon.textContent = "🔒";
      bubbleNode.append(icon, document.createTextNode(info.text));
    } else if (info.kind === "secret") {
      const label = document.createElement("span");
      label.textContent = "對話中…";
      const dots = document.createElement("i");
      dots.className = "dots";
      bubbleNode.append(label, dots);
    } else {
      bubbleNode.textContent = info.text || "";
    }
    if (!anchor) {
      node.hidden = true;
      return;
    }
    anchor.getWorldPosition(projected);
    projected.project(camera);
    if (projected.z > 1) {
      node.hidden = true;
      return;
    }
    const rect = view.getBoundingClientRect();
    const host = labels.getBoundingClientRect();
    const sx = rect.left - host.left + (projected.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top - host.top + (-projected.y * 0.5 + 0.5) * rect.height;
    node.hidden = false;
    node.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  }

  function clearGroups() {
    for (const group of [floorGroup, wallGroup, propGroup]) group.clear();
    walls.length = 0;
    for (const actor of actors.values()) actorGroup.remove(actor);
    actors.clear();
    for (const node of floaters.values()) node.remove();
    floaters.clear();
    for (const aura of auras.values()) {
      actorGroup.remove(aura);
      for (const child of aura.children) child.material.dispose();
    }
    auras.clear();
    for (const mesh of furnMeshes.values()) furnGroup.remove(mesh);
    furnMeshes.clear();
  }

  function build(map) {
    clearGroups();
    buildFloor(map);
    buildWalls(map);
    buildProps(map);
    builtMap = map;
  }

  function syncFurniture(state) {
    const specs = state.specs;
    const list = state.furniture || [];
    const ids = new Set(list.map((item) => item.id));
    for (const [id, mesh] of furnMeshes) {
      if (!ids.has(id)) {
        furnGroup.remove(mesh);
        furnMeshes.delete(id);
      }
    }
    for (const item of list) {
      let mesh = furnMeshes.get(item.id);
      if (!mesh || mesh.userData.kind !== item.kind) {
        if (mesh) furnGroup.remove(mesh);
        mesh = makeFurniture(item);
        furnMeshes.set(item.id, mesh);
        furnGroup.add(mesh);
      }
      const size = item.kind === "chair" ? { w: 32, h: 26 } : itemSize(item, specs);
      const tx = item.x + size.w / 2;
      const tz = item.y + size.h / 2;
      const remoteRide = item.kind === "chair" && item.seat && item.seat !== state.me?.id;
      if (remoteRide) {
        const blend = 1 - Math.exp(-12 * Math.max(0.001, state.dt || 0.016));
        const sx = mesh.userData.sx ?? tx;
        const sz = mesh.userData.sz ?? tz;
        mesh.userData.sx = sx + (tx - sx) * blend;
        mesh.userData.sz = sz + (tz - sz) * blend;
        mesh.position.set(mesh.userData.sx, 0, mesh.userData.sz);
      } else {
        mesh.position.set(tx, 0, tz);
        mesh.userData.sx = tx;
        mesh.userData.sz = tz;
      }
      mesh.rotation.y = THREE.MathUtils.degToRad(item.rot || 0);
      mesh.userData.speed = item.speed || 0;
      if (mesh.userData.ring) mesh.userData.ring.visible = state.selected === item.id;
    }
  }

  function reveal() {
    const roots = [];
    for (const group of [wallGroup, propGroup, furnGroup]) {
      for (const child of group.children) {
        if (child.userData.occlude) roots.push(child);
      }
    }
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const toCamX = camX - look.x;
    const toCamZ = camZ - look.z;
    const len = Math.hypot(toCamX, toCamZ) || 1;
    for (const wall of walls) {
      let scale = world.mode === "iso" ? 0.72 : 1;
      if (world.mode === "iso") {
        const x = clamp(look.x, wall.minX, wall.maxX);
        const z = clamp(look.z, wall.minZ, wall.maxZ);
        const along = ((x - look.x) * toCamX + (z - look.z) * toCamZ) / len;
        const side = Math.abs((x - look.x) * toCamZ - (z - look.z) * toCamX) / len;
        if (along > 24 && side < 90) scale = 0.08;
      }
      wall.mesh.scale.y = scale;
      wall.mesh.position.y = (wall.h * scale) / 2;
    }
    if (world.mode !== "follow") {
      for (const root of roots) setFade(root, false);
      return;
    }
    const faded = new Set();
    const chest = new THREE.Vector3(look.x, Math.max(18, look.y), look.z);
    const head = chest.clone();
    head.y += 22;
    for (const target of [chest, head]) {
      const delta = target.clone().sub(camera.position);
      const dist = delta.length();
      if (dist < 8) continue;
      raycaster.set(camera.position, delta.multiplyScalar(1 / dist));
      raycaster.near = 1;
      raycaster.far = dist - 8;
      const hits = raycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        let node = hit.object;
        while (node && !node.userData?.occlude) node = node.parent;
        if (node) faded.add(node);
      }
    }
    for (const root of roots) setFade(root, faded.has(root));
  }

  function resize() {
    const width = Math.max(1, view.clientWidth);
    const height = Math.max(1, view.clientHeight);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (previewRenderer && preview) {
      const pw = Math.max(1, preview.clientWidth || preview.width);
      const ph = Math.max(1, preview.clientHeight || preview.height);
      previewRenderer.setSize(pw, ph, false);
      previewCamera.aspect = pw / ph;
      previewCamera.updateProjectionMatrix();
    }
  }

  let posed = world.mode;

  function placeCamera(dt) {
    const pitch = world.mode === "follow" ? world.followPitch : world.pitch;
    const dist = world.mode === "follow" ? world.followDist : world.dist;
    let yaw = world.yaw;
    if (world.mode === "follow") yaw = world.face + Math.PI + world.yawOffset;
    const sinP = Math.sin(pitch);
    desired.set(
      look.x + dist * sinP * Math.sin(yaw),
      look.y + dist * Math.cos(pitch),
      look.z + dist * sinP * Math.cos(yaw),
    );
    const switched = posed !== world.mode;
    posed = world.mode;
    const blend = !snapped || switched ? 1 : 1 - Math.exp(-Math.max(0.001, dt) * 8);
    camera.position.lerp(desired, blend);
    const fov = world.mode === "follow" ? 48 : 40;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(look);
    camera.updateMatrixWorld(true);
    world.heading = yaw;
    snapped = true;
    sun.position.set(look.x + 160, look.y + 380, look.z + 70);
    sun.target.position.set(look.x, 0, look.z);
    sun.target.updateMatrixWorld();
  }

  function sync(state, dt) {
    if (!world.ok) return;
    if (state.map && state.map !== builtMap) build(state.map);
    const focus = state.editing && state.focus ? state.focus : state.me;
    if (focus) {
      const height = world.mode === "follow" ? 46 : 8;
      const next = new THREE.Vector3(focus.x, height, focus.y);
      if (!snapped || posed !== world.mode) look.copy(next);
      else look.lerp(next, 1 - Math.exp(-Math.max(0.001, dt) * 8));
    }
    state.dt = dt || 0.016;
    syncFurniture(state);
    spinChairs(performance.now() / 1000, state.dt);
    syncActors(state, performance.now() / 1000, dt || 0.016);
    placeCamera(dt || 0.016);
    actorGroup.updateMatrixWorld(true);
    for (const [id, actor] of actors) {
      const label = actor.userData.label;
      if (label) placeFloater(id, actor.userData.anchor, label.title, label.subtitle, label.bubble);
    }
    reveal();
    renderer.render(scene, camera);
  }

  function spinChairs(time, dt) {
    for (const mesh of furnMeshes.values()) {
      if (mesh.userData.kind !== "chair") continue;
      const speed = mesh.userData.speed || 0;
      for (const wheel of mesh.userData.wheels || []) wheel.rotation.z += speed * dt * 0.09;
      const seat = mesh.userData.seatPivot;
      if (!seat) continue;
      if (speed > 36) mesh.userData.fast = true;
      if (mesh.userData.fast && speed < 14) {
        mesh.userData.wobble = Math.max(mesh.userData.wobble || 0, 0.16);
        mesh.userData.fast = false;
      }
      mesh.userData.wobble = (mesh.userData.wobble || 0) * Math.exp(-5.5 * dt);
      seat.rotation.x = Math.sin(time * 13) * (mesh.userData.wobble || 0);
    }
  }

  function renderPreview(look, time) {
    ensurePreview();
    if (!previewRenderer || !previewScene) return;
    const src = look && typeof look === "object" ? look : FALLBACK_LOOK;
    const sig = signature(src);
    if (!previewActor || previewActor.userData.sig !== sig) {
      if (previewActor) previewScene.remove(previewActor);
      previewActor = creature(src);
      previewActor.userData.sig = sig;
      previewActor.userData.faceCamera = false;
      previewScene.add(previewActor);
    }
    const spin = time || 0;
    animateActor(previewActor, false, spin, 0, false, 0.016);
    previewActor.rotation.y = Math.sin(spin * 0.8) * 0.22;
    previewActor.userData.heading = previewActor.rotation.y;
    previewActor.position.set(0, 0, 0);
    previewRenderer.render(previewScene, previewCamera);
  }

  function screenToWorld(clientX, clientY) {
    const rect = view.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return { x: look.x, y: look.z };
    return { x: hit.x, y: hit.z };
  }

  function worldToScreen(x, y) {
    const rect = view.getBoundingClientRect();
    projected.set(x, 0, y).project(camera);
    return {
      x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
    };
  }

  function orbit(dx, dy) {
    if (world.mode === "follow") world.yawOffset -= dx * 0.005;
    else world.yaw -= dx * 0.005;
    if (world.mode === "follow") world.followPitch = clamp(world.followPitch + dy * 0.003, FOLLOW_PITCH - 0.09, FOLLOW_PITCH + 0.09);
    else world.pitch = clamp(world.pitch + dy * 0.003, 0.48, 1.02);
  }

  function aim(view = {}) {
    if (typeof view.yaw === "number") world.yaw = view.yaw;
    if (typeof view.pitch === "number") world.pitch = view.pitch;
    if (typeof view.dist === "number") {
      if (world.mode === "follow") world.followDist = view.dist;
      else world.dist = view.dist;
    }
  }

  function zoom(delta) {
    const factor = Math.exp(delta * 0.0011);
    if (world.mode === "follow") world.followDist = clamp(world.followDist * factor, 140, 420);
    else world.dist = clamp(world.dist * factor, 280, 1400);
  }

  function toggle() {
    world.mode = world.mode === "iso" ? "follow" : "iso";
    if (world.mode === "follow") world.yawOffset = 0;
    return world.mode;
  }

  function axes() {
    const yaw = world.heading;
    return {
      forwardX: -Math.sin(yaw),
      forwardY: -Math.cos(yaw),
      rightX: Math.cos(yaw),
      rightY: -Math.sin(yaw),
    };
  }

  resize();
  return {
    get ok() { return world.ok; },
    get previewOk() { return world.previewOk; },
    get mode() { return world.mode; },
    get yaw() { return world.yaw; },
    get dist() { return world.mode === "follow" ? world.followDist : world.dist; },
    aim,
    resize,
    sync,
    preview: renderPreview,
    radius: bodyRadius,
    nudge,
    gap(a, b) {
      const left = actors.get(a);
      const right = actors.get(b);
      if (!left || !right) return null;
      return Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z);
    },
    orbit,
    zoom,
    toggle,
    axes,
    screenToWorld,
    worldToScreen,
  };
}

function bodySpec(id) {
  return BODY_SHAPES[id] || BODY_SHAPES.bean;
}

function bodyMetrics(id) {
  const spec = bodySpec(id);
  const half = spec.radius * spec.stretch;
  const topY = spec.center + half;
  const beanTop = BODY_CENTER + BODY_R * BODY_STRETCH;
  return {
    spec,
    half,
    topY,
    shift: topY - beanTop,
    spread: spec.radius / BODY_R,
    faceLift: FACE_LIFT * (half / (BODY_R * BODY_STRETCH)),
  };
}

function mochiWiden(spec, y) {
  const ny = Math.max(0, Math.min(1, y / spec.radius * 0.5 + 0.5));
  return spec.top + (1 - ny) * (spec.bottom - spec.top);
}

function deformMochi(spec, x, y, z) {
  const widen = mochiWiden(spec, y);
  return { x: x * widen, y: y * spec.stretch, z: z * widen * 0.98 };
}

function projectToMochi(spec, xWant, yWant) {
  const y = Math.max(-spec.radius * 0.96, Math.min(spec.radius * 0.96, yWant / spec.stretch));
  const widen = mochiWiden(spec, y);
  let x = xWant / widen;
  const room = spec.radius * spec.radius - y * y;
  const limit = Math.sqrt(Math.max(0, room * 0.9));
  if (Math.abs(x) > limit) x = Math.sign(x || 1) * limit;
  const z = Math.sqrt(Math.max(0.08, spec.radius * spec.radius - x * x - y * y));
  const p = deformMochi(spec, x, y, z);
  const e = 0.06;
  const y2 = Math.max(-spec.radius * 0.96, Math.min(spec.radius * 0.96, y + e));
  const px = deformMochi(spec, x + e, y, Math.sqrt(Math.max(0.05, spec.radius * spec.radius - (x + e) * (x + e) - y * y)));
  const py = deformMochi(spec, x, y2, Math.sqrt(Math.max(0.05, spec.radius * spec.radius - x * x - y2 * y2)));
  const tx = { x: px.x - p.x, y: px.y - p.y, z: px.z - p.z };
  const ty = { x: py.x - p.x, y: py.y - p.y, z: py.z - p.z };
  let nx = tx.y * ty.z - tx.z * ty.y;
  let ny = tx.z * ty.x - tx.x * ty.z;
  let nz = tx.x * ty.y - tx.y * ty.x;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: p.x, y: p.y, z: p.z, nx: nx / len, ny: ny / len, nz: nz / len };
}

function liftColor(hex) {
  const t = 0.42;
  const mix = (channel, target) => Math.round(channel + (target - channel) * t);
  return (mix((hex >> 16) & 255, 255) << 16) | (mix((hex >> 8) & 255, 248) << 8) | mix(hex & 255, 244);
}

function hexCss(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, "0")}`;
}

function mixHex(a, b, t) {
  const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function toonGradient() {
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 3, 1);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function softToonGradient() {
  const data = new Uint8Array([
    168, 168, 168, 255,
    205, 205, 205, 255,
    232, 232, 232, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(data, 4, 1);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

