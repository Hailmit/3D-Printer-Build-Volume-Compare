import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const sceneEl = document.getElementById('scene');
const listEl = document.getElementById('printer-list');
const gizmoEl = document.getElementById('gizmo');
const axesToggle = document.getElementById('toggle-axes');
const benchyToggle = document.getElementById('toggle-benchy');
const benchyColorInput = document.getElementById('benchy-color');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const pageEl = document.getElementById('page');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const alignSelect = document.getElementById('align-mode');
const customNameInput = document.getElementById('custom-name');
const customXInput = document.getElementById('custom-x');
const customYInput = document.getElementById('custom-y');
const customZInput = document.getElementById('custom-z');
const customColorInput = document.getElementById('custom-color');
const customAddBtn = document.getElementById('custom-add');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.addEventListener('start', () => exitFlatten());
let cameraTarget = new THREE.Vector3();

// Mini orientation gizmo (renders separately)
const gizmoScene = new THREE.Scene();
const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
gizmoCamera.up.set(0, 0, 1);
gizmoCamera.position.set(1.4, 1.4, 1.4);
gizmoCamera.lookAt(0, 0, 0);

const gizmoRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
gizmoRenderer.setPixelRatio(window.devicePixelRatio || 1);
gizmoRenderer.setSize(110, 110);
gizmoEl.appendChild(gizmoRenderer.domElement);

const gizmoAxes = new THREE.AxesHelper(0.7);
gizmoScene.add(gizmoAxes);

const gizmoCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 0.8, 0.8),
  new THREE.MeshBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.7 })
);
gizmoScene.add(gizmoCube);

const gizmoLabels = [];
const labelOffset = 0.58;
const labelDefs = [
  { text: 'Top', pos: new THREE.Vector3(0, 0, labelOffset), view: new THREE.Vector3(0, 0, 1) },
  { text: 'Bottom', pos: new THREE.Vector3(0, 0, -labelOffset), view: new THREE.Vector3(0, 0, -1) },
  { text: 'Front', pos: new THREE.Vector3(0, labelOffset, 0), view: new THREE.Vector3(0, 1, 0) },
  { text: 'Back', pos: new THREE.Vector3(0, -labelOffset, 0), view: new THREE.Vector3(0, -1, 0) },
  { text: 'Right', pos: new THREE.Vector3(labelOffset, 0, 0), view: new THREE.Vector3(1, 0, 0) },
  { text: 'Left', pos: new THREE.Vector3(-labelOffset, 0, 0), view: new THREE.Vector3(-1, 0, 0) }
];

function makeLabel(text) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111827';
  ctx.font = '800 34px Segoe UI';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2 + 1.5, size / 2 + 1.5);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(text, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
  );
}

labelDefs.forEach(({ text, pos, view }) => {
  const sprite = makeLabel(text);
  sprite.position.copy(pos);
  sprite.scale.setScalar(0.45);
  sprite.userData.view = view.clone();
  gizmoLabels.push(sprite);
  gizmoScene.add(sprite);
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragState = {
  active: false,
  lastX: 0,
  lastY: 0,
  theta: 0,
  phi: Math.PI / 2,
  velTheta: 0,
  velPhi: 0
};

const meshes = new Map();
let axisGroup = null;
let printersData = [];
let labels = new Map();
let searchInput = null;
let flattenAxis = null;
let benchy = null;
let benchyColor = '#ff8a3d';
let hoveredLabel = null;
let alignMode = alignSelect?.value || 'center';
let gridHelper = null;
let ambientLight = null;
let directionalLight = null;

bootstrap();

async function bootstrap() {
  try {
    handleResize();
    window.addEventListener('resize', handleResize);

    printersData = await loadPrinters();
    buildScene(printersData);
    wireSearch();
    renderList(searchInput ? searchInput.value : '');
    wireToggles();
    wireSceneHover();
    wireCustomForm();
    wireSidebar();
    animate();
  } catch (err) {
    console.error(err);
  }
}

async function loadPrinters() {
  const response = await fetch('data/printers.json');
  if (!response.ok) throw new Error(`Failed to fetch printers.json (${response.status})`);
  const data = await response.json();
  return data.flatMap((group) =>
    group.printers.map((printer) => ({
      ...printer,
      brand: group.brand
    }))
  );
}

function buildScene(printers) {
  listEl.innerHTML = '';

  printers.forEach((printer) => {
    createPrinterMesh(printer, false);
  });

  updatePlacements();
  const bounds = computeSceneBounds();
  updateGridAndCamera(bounds);
  addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
  ensureLights();
  loadBenchy();
}

function addPrinterToggle(printer) {
  const wrapper = document.createElement('label');
  wrapper.className = 'printer-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const mesh = meshes.get(printer.name);
  checkbox.checked = mesh ? mesh.visible : false;
  checkbox.dataset.printer = printer.name;

  const swatch = document.createElement('span');
  swatch.className = 'color';
  swatch.style.backgroundColor = printer.color;

  const info = document.createElement('div');
  info.className = 'info';
  const volumeLiters = (printer.x * printer.y * printer.z) / 1_000_000;
  info.innerHTML = `<strong>${printer.name}</strong><small>${printer.brand} · ${printer.x} x ${printer.y} x ${printer.z} mm · ${volumeLiters.toFixed(2)} L</small>`;

  checkbox.addEventListener('change', (event) => {
    const mesh = meshes.get(event.target.dataset.printer);
    if (mesh) mesh.visible = event.target.checked;
    updateLabelVisibility(printer.name, event.target.checked, printer);
    updatePlacements();
    const bounds = computeSceneBounds();
    updateGridAndCamera(bounds);
    addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
    applyFlatten(flattenAxis);
  });

  wrapper.addEventListener('mouseleave', () => {
    highlightPrinter(printer.name, false);
  });

  wrapper.append(checkbox, swatch, info);
  listEl.appendChild(wrapper);

  // Sync label when rendering list (keeps state if already selected)
  updateLabelVisibility(printer.name, checkbox.checked, printer);

  // Hover state for both label and mesh
  wrapper.addEventListener('mouseenter', () => highlightPrinter(printer.name, true));
  wrapper.addEventListener('mouseleave', () => highlightPrinter(printer.name, false));
}

function renderList(query = '') {
  listEl.innerHTML = '';
  const normalized = query.trim().toLowerCase();
  const filtered = printersData
    .filter(
      (p) =>
        normalized.length === 0 ||
        p.name.toLowerCase().includes(normalized) ||
        p.brand.toLowerCase().includes(normalized)
    )
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.style.color = '#94a3b8';
    empty.style.fontSize = '13px';
    empty.textContent = 'No printers match your search.';
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach((printer) => addPrinterToggle(printer));
  updatePlacements();
}

function wireSearch() {
  searchInput = document.getElementById('printer-search');
  if (!searchInput) return;
  const handler = () => renderList(searchInput.value);
  searchInput.addEventListener('input', handler);
  searchInput.addEventListener('search', handler);
}

function wireToggles() {
  if (axesToggle) {
    axesToggle.addEventListener('change', () => {
      if (axisGroup) axisGroup.visible = axesToggle.checked;
    });
  }
  if (benchyToggle) {
    benchyToggle.addEventListener('change', () => {
      if (benchy) benchy.visible = benchyToggle.checked;
      const bounds = computeSceneBounds();
      updateGridAndCamera(bounds);
      addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
    });
  }
  if (benchyColorInput) {
    benchyColorInput.addEventListener('input', () => {
      benchyColor = benchyColorInput.value;
      applyBenchyColor();
    });
  }
  if (alignSelect) {
    alignSelect.addEventListener('change', () => {
      alignMode = alignSelect.value;
      updatePlacements();
      const bounds = computeSceneBounds();
      updateGridAndCamera(bounds);
      addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
      applyFlatten(flattenAxis);
    });
  }
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.classList.remove('open');
      }
    });
  }
}

function wireSidebar() {
  if (!sidebar || !sidebarToggle) return;
  const sidebarWidth = 340;
  const applyState = (hidden) => {
    sidebar.dataset.hidden = hidden ? 'true' : 'false';
    sidebar.style.display = hidden ? 'none' : 'flex';
    sidebar.style.marginLeft = '0';
    if (pageEl) pageEl.style.gridTemplateColumns = hidden ? `1fr` : `${sidebarWidth}px 1fr`;
    sidebarToggle.textContent = hidden ? "\u2261" : "\u2039";
    handleResize();
  };

  sidebarToggle.addEventListener('click', () => {
    const hidden = sidebar.dataset.hidden === 'true';
    applyState(!hidden);
  });
  applyState(false);
}

function wireCustomForm() {
  if (!customAddBtn) return;
  customAddBtn.addEventListener('click', () => {
    const name = (customNameInput?.value || '').trim() || `Custom ${printersData.length + 1}`;
    const x = Number(customXInput?.value || 0);
    const y = Number(customYInput?.value || 0);
    const z = Number(customZInput?.value || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || x <= 0 || y <= 0 || z <= 0) return;
    const color = (customColorInput?.value || randomColor()).trim();
    const printer = { name, x, y, z, color, brand: 'Custom' };

    // Replace existing custom with same name
    const existingIndex = printersData.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existingIndex !== -1) {
      removePrinter(printersData[existingIndex].name);
      printersData.splice(existingIndex, 1, printer);
    } else {
      printersData.push(printer);
    }

    createPrinterMesh(printer, true);
    updatePlacements();
    const bounds = computeSceneBounds();
    updateGridAndCamera(bounds);
    addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
    applyFlatten(flattenAxis);
    renderList(searchInput ? searchInput.value : '');
  });
}

function wireSceneHover() {
  const handleHover = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const visibleLabels = Array.from(labels.values()).filter((sprite) => sprite.visible);
    const hits = raycaster.intersectObjects(visibleLabels, false);
    const name = hits.length ? hits[0].object.userData.printer : null;
    if (name !== hoveredLabel) {
      if (hoveredLabel) highlightPrinter(hoveredLabel, false);
      hoveredLabel = name;
      if (name) highlightPrinter(name, true);
    }
  };

  renderer.domElement.addEventListener('pointermove', handleHover);
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hoveredLabel) highlightPrinter(hoveredLabel, false);
    hoveredLabel = null;
  });
}

function updateLabelVisibility(name, visible, printer) {
  if (!labels.has(name)) {
    const sprite = createNameLabel(name);
    const { x, y } = labelOffsetFor(name, Math.max(printer?.x || 0, printer?.y || 0));
    const zOffset = (printer?.z || 0) + 40;
    sprite.userData.localPos = new THREE.Vector3(x, y, zOffset);
    sprite.userData.printer = name;
    sprite.userData.baseOpacity = 0.78;
    labels.set(name, sprite);
  }
  const sprite = labels.get(name);
  if (sprite && !scene.children.includes(sprite)) scene.add(sprite);
  sprite.visible = visible;
  syncLabelPosition(name);
}

function createNameLabel(text) {
  const padding = 18;
  const fontSize = 28;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${fontSize}px Segoe UI`;
  const textWidth = ctx.measureText(text).width;
  const width = Math.ceil(textWidth + padding * 2);
  const height = 48;

  canvas.width = width;
  canvas.height = height;
  ctx.font = `700 ${fontSize}px Segoe UI`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const scaleFactor = 0.4;
  sprite.scale.set(width * scaleFactor, height * scaleFactor, 1);
  sprite.visible = false;
  return sprite;
}

function labelOffsetFor(name, span) {
  const radius = Math.max(span * 0.3, 50);
  // Distribute angles using a simple hash to avoid overlap
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 131 + name.charCodeAt(i)) & 0xffffffff;
  }
  const angle = ((hash % 12) * 30) * (Math.PI / 180); // 12 slots around circle
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function highlightPrinter(printerName, on) {
  const mesh = meshes.get(printerName);
  const label = labels.get(printerName);
  if (mesh && mesh.visible) {
    const fill = mesh.userData.fill;
    const edge = mesh.userData.edges;
    const baseColor = mesh.userData.baseColor;
    if (fill) {
      fill.material.opacity = on ? 0.32 : 0.18;
      fill.material.color.copy(baseColor);
      if (on) fill.material.color.offsetHSL(0, 0, 0.1);
    }
    if (edge) {
      edge.material.opacity = on ? 1 : 0.6;
      edge.material.color.copy(baseColor);
      if (on) edge.material.color.offsetHSL(0, 0, 0.1);
    }
  }
  if (label) {
    const material = label.material;
    if (material && material.map && material.map.image) {
      material.opacity = on ? 1 : label.userData.baseOpacity || 0.78;
    }
  }
}

function handleResize() {
  const width = sceneEl.clientWidth || sceneEl.offsetWidth || window.innerWidth;
  const height = sceneEl.clientHeight || sceneEl.offsetHeight || window.innerHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  gizmoRenderer.setSize(gizmoEl.clientWidth || 110, gizmoEl.clientHeight || 110);
}

function addAxisArrows(maxDimension) {
  if (axisGroup) {
    scene.remove(axisGroup);
  }
  const len = Math.max(maxDimension * 0.5, 200);
  const headLength = Math.max(len * 0.12, 20);
  const headWidth = headLength * 0.4;

  axisGroup = new THREE.Group();
  const origin = new THREE.Vector3(0, 0, 0);

  const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, len, 0xff5555, headLength, headWidth);
  const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, len, 0x55ff55, headLength, headWidth);
  const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, len, 0x5599ff, headLength, headWidth);

  axisGroup.add(xArrow, yArrow, zArrow);
  scene.add(axisGroup);
  if (axesToggle) axisGroup.visible = axesToggle.checked;
}

function snapCameraTo(viewVector) {
  if (!viewVector) return;
  const distance = camera.position.distanceTo(cameraTarget);
  const dir = viewVector.clone().normalize();
  const newPos = cameraTarget.clone().add(dir.multiplyScalar(distance));
  camera.position.copy(newPos);
  camera.up.set(0, 0, 1);
  camera.lookAt(cameraTarget);
  controls.target.copy(cameraTarget);
  controls.update();
  applyFlatten(axisFromView(viewVector));
}

function applyGizmoOrbit() {
  const distance = camera.position.distanceTo(cameraTarget);
  if (!dragState.active && Math.abs(dragState.velTheta) < 1e-4 && Math.abs(dragState.velPhi) < 1e-4) return;

  dragState.theta += dragState.velTheta;
  dragState.phi += dragState.velPhi;

  const eps = 0.05;
  dragState.phi = Math.max(eps, Math.min(Math.PI - eps, dragState.phi));

  const spherical = new THREE.Spherical(distance, dragState.phi, dragState.theta);
  const offset = new THREE.Vector3().setFromSpherical(spherical);
  camera.position.copy(cameraTarget).add(offset);
  camera.lookAt(cameraTarget);
  controls.target.copy(cameraTarget);

  const damping = dragState.active ? 0.9 : 0.94;
  dragState.velTheta *= damping;
  dragState.velPhi *= damping;

  if (dragState.active) exitFlatten();
}

gizmoRenderer.domElement.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;

  const offset = camera.position.clone().sub(cameraTarget);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  dragState.theta = spherical.theta;
  dragState.phi = spherical.phi;
  dragState.velTheta = 0;
  dragState.velPhi = 0;

  const rect = gizmoRenderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, gizmoCamera);
  const hits = raycaster.intersectObjects(gizmoLabels, false);
  if (!hits.length) return;
  const view = hits[0].object.userData.view;
  snapCameraTo(view);
  applyFlatten(axisFromView(view));
});

gizmoRenderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons === 0) return;
  dragState.active = true;
  event.preventDefault();
  const dx = event.clientX - dragState.lastX;
  const dy = event.clientY - dragState.lastY;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;

  const rotateSpeed = 0.0025;
  dragState.velTheta -= dx * rotateSpeed;
  dragState.velPhi -= dy * rotateSpeed;
});

['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => {
  gizmoRenderer.domElement.addEventListener(evt, () => {
    dragState.active = false;
  });
});

function animate() {
  requestAnimationFrame(animate);
  applyGizmoOrbit();
  controls.update();
  renderer.render(scene, camera);

  // Sync gizmo orientation with main camera
  gizmoCamera.position.set(0, 0, 1.5);
  gizmoCamera.position.applyQuaternion(camera.quaternion);
  gizmoCamera.up.copy(camera.up);
  gizmoCamera.lookAt(gizmoScene.position);
  gizmoRenderer.render(gizmoScene, gizmoCamera);
}

function axisFromView(view) {
  const abs = view.clone().normalize().abs();
  if (abs.x >= abs.y && abs.x >= abs.z) return 'x';
  if (abs.y >= abs.x && abs.y >= abs.z) return 'y';
  return 'z';
}

function applyFlatten(axis) {
  flattenAxis = axis;
  meshes.forEach((mesh) => {
    if (!mesh) return;
    mesh.scale.set(1, 1, 1);
    if (!axis) return;
    const thin = 0.001;
    if (axis === 'x') mesh.scale.x = thin;
    if (axis === 'y') mesh.scale.y = thin;
    if (axis === 'z') mesh.scale.z = thin;
  });
  if (benchy) {
    benchy.scale.set(1, 1, 1);
    if (axis) {
      const thin = 0.001;
      if (axis === 'x') benchy.scale.x = thin;
      if (axis === 'y') benchy.scale.y = thin;
      if (axis === 'z') benchy.scale.z = thin;
    }
    applyBenchyColor(); // reapply material in case it was reset
  }
}

function exitFlatten() {
  if (!flattenAxis) return;
  applyFlatten(null);
}

function createPrinterMesh(printer, startVisible = false) {
  const boxGeometry = new THREE.BoxGeometry(printer.x, printer.y, printer.z);
  boxGeometry.translate(0, 0, printer.z / 2); // center on origin, sit on build plate

  const fill = new THREE.Mesh(
    boxGeometry,
    new THREE.MeshPhysicalMaterial({
      color: printer.color,
      transparent: true,
      opacity: 0.18,
      roughness: 0.6,
      metalness: 0,
      transmission: 0.1,
      depthWrite: false
    })
  );

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeometry),
    new THREE.LineBasicMaterial({
      color: printer.color,
      transparent: true,
      opacity: 0.6
    })
  );

  const group = new THREE.Group();
  group.name = printer.name;
  group.add(fill);
  group.add(edges);
  group.visible = startVisible;
  group.userData.fill = fill;
  group.userData.edges = edges;
  group.userData.baseColor = new THREE.Color(printer.color);
  group.userData.dim = { x: printer.x, y: printer.y, z: printer.z };

  scene.add(group);
  meshes.set(printer.name, group);
}

function removePrinter(name) {
  const mesh = meshes.get(name);
  if (mesh) {
    scene.remove(mesh);
    meshes.delete(name);
  }
  const label = labels.get(name);
  if (label) {
    scene.remove(label);
    labels.delete(name);
  }
}

function applyBenchyColor() {
  if (!benchy) return;
  benchy.traverse((child) => {
    if (child.isMesh) {
      const mat = child.material;
      if (mat && mat.color) {
        mat.color.set(benchyColor);
      }
    } else if (child.isLineSegments) {
      const mat = child.material;
      if (mat && mat.color) {
        const edgeColor = new THREE.Color(benchyColor);
        edgeColor.offsetHSL(0, 0, 0.2);
        mat.color.copy(edgeColor);
      }
    }
  });
}

function makeBenchyMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: benchyColor,
    transparent: true,
    opacity: 0.9,
    roughness: 0.45,
    metalness: 0,
    transmission: 0,
    depthWrite: true
  });
}

function makeBenchyEdgeMaterial() {
  const edgeColor = new THREE.Color(benchyColor);
  edgeColor.offsetHSL(0, 0, 0.2);
  return new THREE.LineBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: 0.6
  });
}

function randomColor() {
  const palette = [
    '#ff6f61', '#5adbb5', '#f4c95d', '#8a6be9', '#3fa7d6', '#ff9f1c',
    '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9ef01a', '#ffa69e',
    '#ff6b6b', '#a7c957', '#ffc8dd', '#80ed99', '#ffb4a2', '#64dfdf',
    '#f07167', '#e36414', '#5f0f40', '#fee440', '#30c5ff', '#9d4edd',
    '#00f5d4', '#f77f00', '#5a189a', '#ff5d8f', '#4895ef'
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

function updatePlacements() {
  const visible = printersData
    .map((p) => ({ printer: p, mesh: meshes.get(p.name), volume: p.x * p.y * p.z }))
    .filter((entry) => entry.mesh && entry.mesh.visible);

  const gap = visible.length > 0 ? Math.max(...visible.map((p) => Math.min(p.printer.x, 200))) * 0.5 : 80;

  // Determine placement order
  let order = [];
  if (alignMode === 'row-x') {
    order = [...visible].sort((a, b) => a.volume - b.volume);
  } else {
    order = visible;
  }

  const placements = new Map();
  let offsetX = 0;
  if (alignMode === 'row-x' && order.length > 0) {
    const totalWidth = order.reduce((acc, entry, idx) => acc + entry.printer.x + (idx > 0 ? gap : 0), 0);
    offsetX = -totalWidth / 2;
  }

  order.forEach((entry, idx) => {
    if (alignMode === 'row-x') {
      placements.set(entry.printer.name, {
        x: offsetX + entry.printer.x / 2,
        y: 0
      });
      offsetX += entry.printer.x + gap;
    } else if (alignMode === 'corner') {
      placements.set(entry.printer.name, {
        x: entry.printer.x / 2,
        y: entry.printer.y / 2
      });
    } else {
      placements.set(entry.printer.name, { x: 0, y: 0 });
    }
  });

  printersData.forEach((printer) => {
    const mesh = meshes.get(printer.name);
    if (!mesh) return;
    const pos = placements.get(printer.name) || { x: 0, y: 0 };
    mesh.position.set(pos.x, pos.y, 0);
    syncLabelPosition(printer.name);
  });

  centerSceneXY();
  positionBenchyAtSmallest();
}

function computeSceneBounds() {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  meshes.forEach((mesh) => {
    if (!mesh.visible) return;
    const dim = mesh.userData.dim;
    if (!dim) return;
    const pos = mesh.position;
    const halfX = dim.x / 2;
    const halfY = dim.y / 2;
    minX = Math.min(minX, pos.x - halfX);
    maxX = Math.max(maxX, pos.x + halfX);
    minY = Math.min(minY, pos.y - halfY);
    maxY = Math.max(maxY, pos.y + halfY);
    minZ = Math.min(minZ, 0);
    maxZ = Math.max(maxZ, dim.z);
  });

  if (benchy && benchy.visible && benchy.userData.size) {
    const size = benchy.userData.size;
    minX = Math.min(minX, benchy.position.x - size.x / 2);
    maxX = Math.max(maxX, benchy.position.x + size.x / 2);
    minY = Math.min(minY, benchy.position.y - size.y / 2);
    maxY = Math.max(maxY, benchy.position.y + size.y / 2);
    minZ = Math.min(minZ, benchy.position.z);
    maxZ = Math.max(maxZ, benchy.position.z + size.z);
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 100;
  }

  return {
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
    size: new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ),
    center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
  };
}

function updateGridAndCamera(bounds) {
  if (gridHelper) scene.remove(gridHelper);
  const gridSpan = Math.max(bounds.size.x, bounds.size.y, 400);
  const gridSize = Math.ceil(gridSpan / 50) * 50 + 200;
  gridHelper = new THREE.GridHelper(gridSize, gridSize / 25, 0x3b4358, 0x1f2a3c);
  gridHelper.rotation.x = Math.PI / 2;
  scene.add(gridHelper);

  cameraTarget = new THREE.Vector3(bounds.center.x, bounds.center.y, Math.max(bounds.size.z * 0.4, 60));
  const cameraDistance = Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 1.4 + 200;
  camera.position.set(cameraTarget.x + cameraDistance * 0.35, cameraTarget.y - cameraDistance, cameraDistance * 0.7);
  camera.lookAt(cameraTarget);
  controls.target.copy(cameraTarget);
  controls.minDistance = 200;
  controls.maxDistance = 5000;
}

function centerSceneXY() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  meshes.forEach((mesh) => {
    if (!mesh.visible) return;
    const dim = mesh.userData.dim;
    if (!dim) return;
    const halfX = dim.x / 2;
    const halfY = dim.y / 2;
    minX = Math.min(minX, mesh.position.x - halfX);
    maxX = Math.max(maxX, mesh.position.x + halfX);
    minY = Math.min(minY, mesh.position.y - halfY);
    maxY = Math.max(maxY, mesh.position.y + halfY);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

  const offsetX = -((minX + maxX) / 2);
  const offsetY = -((minY + maxY) / 2);

  meshes.forEach((mesh, name) => {
    if (!mesh.visible) return;
    mesh.position.x += offsetX;
    mesh.position.y += offsetY;
    syncLabelPosition(name);
  });
}

function positionBenchyAtSmallest() {
  if (!benchy || !benchy.userData.size) return;
  const visible = printersData
    .filter((p) => meshes.get(p.name)?.visible)
    .map((p) => {
      const mesh = meshes.get(p.name);
      return { printer: p, mesh, volume: p.x * p.y * p.z };
    })
    .filter((entry) => entry.mesh);

  if (!visible.length) {
    benchy.position.set(0, 0, 0);
    return;
  }

  visible.sort((a, b) => a.volume - b.volume);
  const target = visible[0].mesh;
  benchy.position.set(target.position.x, target.position.y, 0);
}

function syncLabelPosition(name) {
  const label = labels.get(name);
  const mesh = meshes.get(name);
  if (!label || !mesh) return;
  const local = label.userData.localPos || new THREE.Vector3();
  label.position.set(
    mesh.position.x + local.x,
    mesh.position.y + local.y,
    mesh.position.z + local.z
  );
}

function ensureLights() {
  if (!ambientLight) {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
  }
  if (!directionalLight) {
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
    directionalLight.position.set(1, -1, 2.5);
    scene.add(directionalLight);
  }
}
function loadBenchy() {
  if (benchy) {
    scene.remove(benchy);
    benchy = null;
  }

  const loader = new STLLoader();
  loader.load(
    'assets/3DBenchy.stl',
    (geometry) => {
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      // Center on XY and place base on z=0
      geometry.translate(-center.x, -center.y, -bbox.min.z);

      const mesh = new THREE.Mesh(geometry, makeBenchyMaterial());
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        makeBenchyEdgeMaterial()
      );

      benchy = new THREE.Group();
      benchy.name = 'Benchy';
      benchy.add(mesh);
      benchy.add(edges);
      benchy.visible = benchyToggle ? benchyToggle.checked : true;
      benchy.userData.size = size;
      scene.add(benchy);

      if (flattenAxis) applyFlatten(flattenAxis);
      positionBenchyAtSmallest();
    },
    undefined,
    (err) => {
      console.error('Failed to load Benchy STL', err);
    }
  );
}

