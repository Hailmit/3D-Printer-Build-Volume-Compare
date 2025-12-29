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
const view2DToggle = document.getElementById('view2d-toggle');
const customNameInput = document.getElementById('custom-name');
const customXInput = document.getElementById('custom-x');
const customYInput = document.getElementById('custom-y');
const customZInput = document.getElementById('custom-z');
const customColorInput = document.getElementById('custom-color');
const customAddBtn = document.getElementById('custom-add');
const customToggle = document.getElementById('custom-toggle');
const customFields = document.getElementById('custom-fields');
const customCard = document.getElementById('custom-card');
const modelSelect = document.getElementById('model-select');
const themeToggle = document.getElementById('theme-toggle');
const metricTooltip = document.getElementById('metric-tooltip');
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const hintMain = document.getElementById('hint-main');
const hintModal = document.getElementById('hint-modal');
const hintClose = document.getElementById('hint-close');
const guideOverlay = document.getElementById('guide-overlay');
const guideNext = document.getElementById('guide-next');
const guideSkip = document.getElementById('guide-skip');
const guideTitle = document.getElementById('guide-step-title');
const guideBody = document.getElementById('guide-step-body');
const GUIDE_VERSION = 'v2';
const GUIDE_KEY = `guideDismissed_${GUIDE_VERSION}`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
const basePixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(basePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneEl.appendChild(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.addEventListener('start', () => exitFlatten());
controls.addEventListener('change', () => {
  if (is2DMode) {
    twoDDistance = camera.position.distanceTo(controls.target);
  }
});
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
let resizeObserver = null;
let largestVolume = 1;
let themeMode = 'dark';
let sampleModelType = modelSelect?.value || 'benchy';
let is2DMode = false;
let savedCameraState = { pos: null, target: null };
let cameraTween = null;
let twoDDistance = 400;
const defaultPolar = {
  min: controls.minPolarAngle,
  max: controls.maxPolarAngle
};
let guideStep = 0;
const guideSteps = [
  {
    title: 'Select printers',
    body: 'Use the list on the left to search and tick printers to show or hide their build volumes.'
  },
  {
    title: 'Change view & theme',
    body: 'Top-right icons: settings (axes/Benchys/alignment), theme (dark/light), and 2D/3D toggle.'
  },
  {
    title: 'Recenter & rotate',
    body: 'Drag to orbit, scroll to zoom. In 2D top view, scroll switches back to 3D.'
  },
  {
    title: 'Custom printer',
    body: 'Expand "Custom printer" to enter name, X/Y/Z, and color. Same-name entries replace previous ones.'
  }
];

bootstrap();

async function bootstrap() {
  try {
    handleResize();
    window.addEventListener('resize', handleResize);
    if (sceneEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(sceneEl);
    }

    printersData = await loadPrinters();
    updateLargestVolume();
    buildScene(printersData);
    applyTheme(themeMode);
    wireSearch();
    renderList(searchInput ? searchInput.value : '');
    wireToggles();
    wireSceneHover();
    wireAutoExit2D();
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

function updateLargestVolume() {
  const volumes = printersData.map((p) => p.x * p.y * p.z);
  const maxVol = volumes.length ? Math.max(...volumes) : 1;
  largestVolume = Math.max(1, maxVol);
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
  loadSampleModel(sampleModelType);
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
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      sampleModelType = modelSelect.value || 'benchy';
      loadSampleModel(sampleModelType);
    });
  }
  if (view2DToggle) {
    view2DToggle.addEventListener('click', () => {
      set2DMode(!is2DMode);
      setViewIcon();
    });
    setViewIcon();
  }
  if (themeToggle) {
    const setThemeIcon = () => {
      const isDark = themeMode === 'dark';
      themeToggle.textContent = isDark ? '🌙' : '☀️';
      const label = isDark ? 'Light' : 'Dark';
      themeToggle.title = `Switch to ${label} mode`;
      themeToggle.setAttribute('aria-label', themeToggle.title);
    };
    setThemeIcon();
    themeToggle.addEventListener('click', () => {
      const next = themeMode === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setThemeIcon();
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

  if (hintMain && hintModal) {
    const openHint = () => {
      hintModal.hidden = false;
      document.body.classList.add('hint-open');
      // also reset guide if user requests help again
      localStorage.removeItem(GUIDE_KEY);
    };
    const closeHint = () => {
      hintModal.hidden = true;
      document.body.classList.remove('hint-open');
    };
    hintMain.addEventListener('click', openHint);
    if (hintClose) hintClose.addEventListener('click', closeHint);
    hintModal.addEventListener('click', (e) => {
      if (e.target === hintModal) closeHint();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !hintModal.hidden) closeHint();
    });
  }

  wireGuide();
}

function wireSidebar() {
  if (!sidebar || !sidebarToggle) return;
  const sidebarWidth = 340;
  const applyState = (hidden) => {
    sidebar.dataset.hidden = hidden ? 'true' : 'false';
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    if (isMobile) {
      document.body.classList.toggle('sidebar-open', !hidden);
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.display = hidden ? 'none' : 'flex';
      if (pageEl) pageEl.style.gridTemplateColumns = hidden ? `1fr` : `${sidebarWidth}px 1fr`;
    }
    sidebar.style.marginLeft = '0';
    sidebarToggle.textContent = hidden ? "\u2261" : "\u2039";
    handleResize();
  };

  sidebarToggle.addEventListener('click', () => {
    const hidden = sidebar.dataset.hidden === 'true';
    applyState(!hidden);
  });
  const startHidden = window.matchMedia('(max-width: 1024px)').matches;
  applyState(startHidden);
}

function wireCustomForm() {
  if (customToggle && customFields) {
    const setState = (open) => {
      customFields.hidden = !open;
      customFields.style.display = open ? 'flex' : 'none';
      customToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      const chev = customToggle.querySelector('.chevron');
      if (chev) chev.textContent = open ? '▲' : '▼';
      if (customCard) customCard.classList.toggle('open', open);
    };
    setState(false);
    customToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const open = customFields.hidden;
      setState(open);
    });
  }

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
    updateLargestVolume();
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
  if (isTouch) return; // skip hover logic on touch devices
  const handleHover = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const visibleLabels = Array.from(labels.values()).filter((sprite) => sprite.visible);
    const hits = raycaster.intersectObjects(visibleLabels, false);
    let name = hits.length ? hits[0].object.userData.printer : null;
    if (!name) {
      name = nearestLabelUnderPointer(event, rect);
    }
    if (name !== hoveredLabel) {
      if (hoveredLabel) highlightPrinter(hoveredLabel, false);
      hoveredLabel = name;
      if (name) highlightPrinter(name, true);
    }

    if (name) {
      showInfoTooltip(name, event);
    } else {
      hideInfoTooltip();
    }
  };

  renderer.domElement.addEventListener('pointermove', handleHover);
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hoveredLabel) highlightPrinter(hoveredLabel, false);
    hoveredLabel = null;
    hideInfoTooltip();
  });
}

function wireGuide() {
  if (!guideOverlay || !guideNext || !guideSkip || !guideTitle || !guideBody) return;
  const stored = localStorage.getItem(GUIDE_KEY);
  if (stored === 'true') return;
  const show = () => {
    guideStep = 0;
    guideOverlay.hidden = false;
    document.body.classList.add('hint-open');
    renderGuideStep();
  };
  const hide = () => {
    guideOverlay.hidden = true;
    document.body.classList.remove('hint-open');
  };
  const renderGuideStep = () => {
    const step = guideSteps[guideStep];
    if (!step) return hide();
    guideTitle.textContent = step.title;
    guideBody.textContent = step.body;
    guideNext.textContent = guideStep === guideSteps.length - 1 ? 'Done' : 'Next';
  };
  guideNext.addEventListener('click', () => {
    if (guideStep < guideSteps.length - 1) {
      guideStep += 1;
      renderGuideStep();
    } else {
      localStorage.setItem(GUIDE_KEY, 'true');
      hide();
    }
  });
  guideSkip.addEventListener('click', () => {
    localStorage.setItem(GUIDE_KEY, 'true');
    hide();
  });
  guideOverlay.addEventListener('click', (e) => {
    if (e.target === guideOverlay) {
      localStorage.setItem(GUIDE_KEY, 'true');
      hide();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !guideOverlay.hidden) hide();
  });
  // show after initial render
  setTimeout(show, 200);
}

function wireAutoExit2D() {
  renderer.domElement.addEventListener('wheel', () => {
    if (!is2DMode) return;
    set2DMode(false);
    setViewIcon();
  }, { passive: true });
}

function nearestLabelUnderPointer(event, rect) {
  let best = { name: null, dist: Infinity };
  labels.forEach((sprite, name) => {
    if (!sprite.visible) return;
    const pos = sprite.position.clone();
    pos.project(camera);
    const sx = rect.left + ((pos.x + 1) / 2) * rect.width;
    const sy = rect.top + ((-pos.y + 1) / 2) * rect.height;
    const dx = event.clientX - sx;
    const dy = event.clientY - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.dist) {
      best = { name, dist: d2 };
    }
  });
  const maxDist2 = 30 * 30;
  return best.dist <= maxDist2 ? best.name : null;
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
  const paddingX = 14;
  const paddingY = 8;
  const fontSize = 22;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui`;
  const textWidth = ctx.measureText(text).width;
  const width = Math.ceil(textWidth + paddingX * 2);
  const height = fontSize + paddingY * 2;

  canvas.width = width;
  canvas.height = height;
  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isLight = document.body?.classList.contains('theme-light');
  const bg = isLight ? 'rgba(17, 24, 39, 0.75)' : 'rgba(255, 255, 255, 0.1)';
  const textColor = isLight ? '#f8fafc' : '#e5e7eb';
  const border = isLight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)';

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(width - r, 0);
  ctx.quadraticCurveTo(width, 0, width, r);
  ctx.lineTo(width, height - r);
  ctx.quadraticCurveTo(width, height, width - r, height);
  ctx.lineTo(r, height);
  ctx.quadraticCurveTo(0, height, 0, height - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
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
  const scaleFactor = 0.35;
  sprite.scale.set(width * scaleFactor, height * scaleFactor, 1);
  sprite.visible = false;
  return sprite;
}

function visiblePrinterNames() {
  return Array.from(meshes.entries())
    .filter(([, mesh]) => mesh.visible)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
}

function labelAnchor2D(orderIndex) {
  // Cycle anchors among visible printers to reduce overlap in 2D
  const anchors = [
    { x: -0.45, y: 0.45 },  // top-left (primary)
    { x: 0.45, y: 0.45 },   // top-right
    { x: -0.45, y: -0.45 }, // bottom-left
    { x: 0.45, y: -0.45 },  // bottom-right
    { x: 0, y: 0.45 },      // top-center
    { x: 0, y: -0.45 }      // bottom-center
  ];
  const idx = Math.max(0, orderIndex);
  return anchors[idx % anchors.length];
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
  setViewIcon();
}

function showInfoTooltip(printerName, event) {
  if (!metricTooltip) return;
  const printer = printersData.find((p) => p.name === printerName);
  if (!printer) {
    hideInfoTooltip();
    return;
  }
  const volume = printer.x * printer.y * printer.z;
  const liters = volume / 1_000_000;
  metricTooltip.innerHTML = `
    <strong>${printer.name}</strong>
    <div>${printer.x} × ${printer.y} × ${printer.z} mm</div>
    <div>${liters.toFixed(2)} L</div>
  `;
  metricTooltip.style.display = 'block';
  metricTooltip.style.left = `${event.clientX + 12}px`;
  metricTooltip.style.top = `${event.clientY + 12}px`;
}

function hideInfoTooltip() {
  if (metricTooltip) metricTooltip.style.display = 'none';
}

function handleResize() {
  if (!sceneEl) return;
  const rect = sceneEl.getBoundingClientRect();
  const width = Math.max(1, rect.width || sceneEl.clientWidth || sceneEl.offsetWidth || window.innerWidth);
  const height = Math.max(1, rect.height || sceneEl.clientHeight || sceneEl.offsetHeight || window.innerHeight);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(width, height);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  gizmoRenderer.setSize(gizmoEl.clientWidth || 110, gizmoEl.clientHeight || 110);

  if (is2DMode) {
    const bounds = computeSceneBounds();
    twoDDistance = computeTopDownDistance(bounds);
    const center = new THREE.Vector3(bounds.center.x, bounds.center.y, 0);
    camera.position.set(center.x, center.y, twoDDistance);
    controls.target.copy(center);
    controls.minDistance = twoDDistance * 0.5;
    controls.maxDistance = twoDDistance * 2;
  }
}

function getThemeColors() {
  if (themeMode === 'light') {
    return {
      bg: 0xf5f7fb,
      grid1: 0xcad3e2,
      grid2: 0xdfe5f0
    };
  }
  return {
    bg: 0x0a1020,
    grid1: 0x3b4358,
    grid2: 0x1f2a3c
  };
}

function applyTheme(mode) {
  themeMode = mode === 'light' ? 'light' : 'dark';
  if (document?.body) {
    document.body.classList.toggle('theme-light', themeMode === 'light');
  }
  const bounds = computeSceneBounds();
  updateGridAndCamera(bounds);
  addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
  // refresh label textures for new palette without mutating during iteration
  const labelStates = Array.from(labels.entries()).map(([name, sprite]) => ({
    name,
    visible: sprite.visible
  }));
  labels.forEach((sprite) => scene.remove(sprite));
  labels = new Map();
  labelStates.forEach(({ name, visible }) => {
    const printer = printersData.find((p) => p.name === name);
    updateLabelVisibility(name, visible, printer);
  });

  if (view2DToggle && is2DMode) {
    set2DMode(true); // reapply flattened/z-view under new theme
  }
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
  if (is2DMode) {
    controls.target.z = 0;
    camera.up.set(0, 0, 1);
    camera.position.set(controls.target.x, controls.target.y, twoDDistance);
    camera.lookAt(controls.target);
  }
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

  // If we're flattened (2D view), apply the same flatten to keep consistency
  if (flattenAxis) {
    applyFlatten(flattenAxis);
  }
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
  refreshAllLabelPositions();
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
  const { grid1, grid2, bg } = getThemeColors();
  const gridSpan = Math.max(bounds.size.x, bounds.size.y, 400);
  const gridSize = Math.ceil(gridSpan / 50) * 50 + 200;
  const divs = Math.max(10, Math.round(gridSize / (isTouch ? 60 : 25)));
  gridHelper = new THREE.GridHelper(gridSize, divs, grid1, grid2);
  gridHelper.rotation.x = Math.PI / 2;
  scene.add(gridHelper);

  cameraTarget = new THREE.Vector3(bounds.center.x, bounds.center.y, Math.max(bounds.size.z * 0.4, 60));
  if (is2DMode) {
    // Keep top view during 2D mode and fit scene
    twoDDistance = computeTopDownDistance(bounds);
    const target = new THREE.Vector3(bounds.center.x, bounds.center.y, 0);
    camera.position.set(target.x, target.y, twoDDistance);
    controls.target.copy(target);
    controls.minDistance = twoDDistance * 0.5;
    controls.maxDistance = twoDDistance * 2;
    camera.up.set(0, 0, 1);
    camera.lookAt(controls.target);
    controls.update();
  } else {
    const cameraDistance = Math.max(bounds.size.x, bounds.size.y, bounds.size.z) * 1.4 + 200;
    camera.position.set(cameraTarget.x + cameraDistance * 0.35, cameraTarget.y - cameraDistance, cameraDistance * 0.7);
    camera.lookAt(cameraTarget);
    controls.target.copy(cameraTarget);
    controls.minDistance = 200;
    controls.maxDistance = 5000;
  }

  scene.background = new THREE.Color(bg);
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

function set2DMode(on) {
  is2DMode = on;
  controls.minPolarAngle = on ? 0 : defaultPolar.min;
  controls.maxPolarAngle = on ? 0 : defaultPolar.max;
  controls.enableRotate = !on;
  controls.enablePan = true;
  controls.enableZoom = true;
  if (on) {
    savedCameraState = {
      pos: camera.position.clone(),
      target: controls.target.clone()
    };
    applyFlatten('z');
    const bounds = computeSceneBounds();
    const target = new THREE.Vector3(bounds.center.x, bounds.center.y, 0);
    twoDDistance = computeTopDownDistance(bounds);
    const pos = target.clone().add(new THREE.Vector3(0, 0, twoDDistance));
    smoothCameraMove(pos, target);
    controls.minDistance = twoDDistance * 0.5;
    controls.maxDistance = twoDDistance * 2;
  } else {
    exitFlatten();
    if (savedCameraState.pos && savedCameraState.target) {
      smoothCameraMove(savedCameraState.pos, savedCameraState.target);
    } else {
      const bounds = computeSceneBounds();
      updateGridAndCamera(bounds);
      addAxisArrows(Math.max(bounds.size.x, bounds.size.y, bounds.size.z));
    }
    controls.minDistance = 200;
    controls.maxDistance = 5000;
  }
  setViewIcon();
  refreshAllLabelPositions();
}

function setViewIcon() {
  if (!view2DToggle) return;
  view2DToggle.textContent = is2DMode ? '2D' : '3D';
  view2DToggle.title = is2DMode ? 'Switch to 3D view' : 'Switch to 2D top view';
  view2DToggle.setAttribute('aria-label', view2DToggle.title);
}

function smoothCameraMove(targetPos, targetTarget, duration = 320) {
  if (cameraTween) cancelAnimationFrame(cameraTween);
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const start = performance.now();
  const animateMove = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startTarget, targetTarget, ease);
    camera.lookAt(controls.target);
    controls.update();
    if (t < 1) {
      cameraTween = requestAnimationFrame(animateMove);
    } else {
      cameraTween = null;
    }
  };
  cameraTween = requestAnimationFrame(animateMove);
}

function computeTopDownDistance(bounds) {
  const padding = 50;
  const sizeX = bounds.size.x + padding * 2;
  const sizeY = bounds.size.y + padding * 2;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(0.1, (renderer.domElement.clientWidth || 1) / Math.max(1, renderer.domElement.clientHeight || 1));
  const heightDist = sizeY / (2 * Math.tan(vfov / 2));
  const widthDist = sizeX / (2 * Math.tan(vfov / 2)) / aspect;
  return Math.max(heightDist, widthDist, 200);
}

function syncLabelPosition(name) {
  const label = labels.get(name);
  const mesh = meshes.get(name);
  if (!label || !mesh) return;
  const local = label.userData.localPos || new THREE.Vector3();
  const dim = mesh.userData.dim;
  let zTarget = mesh.position.z + local.z;
  let px = mesh.position.x + local.x;
  let py = mesh.position.y + local.y;

  if (is2DMode && dim) {
    // Anchor label inside the box; rotate anchors among visible printers to reduce overlap
    const order = visiblePrinterNames();
    const anchor = labelAnchor2D(order.indexOf(name));
    const margin = 16;
    const halfLabelX = label.scale.x / 2;
    const halfLabelY = label.scale.y / 2;
    px = mesh.position.x + anchor.x * (dim.x / 2) + Math.sign(anchor.x) * margin;
    py = mesh.position.y + anchor.y * (dim.y / 2) - Math.sign(anchor.y) * margin;
    // Clamp so the label stays fully inside the box
    const minX = mesh.position.x - dim.x / 2 + margin + halfLabelX;
    const maxX = mesh.position.x + dim.x / 2 - margin - halfLabelX;
    const minY = mesh.position.y - dim.y / 2 + margin + halfLabelY;
    const maxY = mesh.position.y + dim.y / 2 - margin - halfLabelY;
    px = Math.min(Math.max(px, minX), maxX);
    py = Math.min(Math.max(py, minY), maxY);
    zTarget = 5;
  } else if (is2DMode) {
    // Keep label below camera when in 2D top view so it never sits behind the camera
    const maxZ = camera.position.z - 10;
    zTarget = Math.min(zTarget, maxZ);
    if (zTarget < 5) zTarget = 5;
  }

  label.position.set(px, py, zTarget);
}

function refreshAllLabelPositions() {
  labels.forEach((_sprite, name) => syncLabelPosition(name));
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

function loadSampleModel(type = 'benchy') {
  if (benchy) {
    scene.remove(benchy);
    benchy = null;
  }

  const isVoron = type === 'voron';
  const path = isVoron ? 'assets/Voron_Design_Cube_v7(R2).stl' : 'assets/3DBenchy.stl';
  const modelLabel = isVoron ? 'Voron Cube' : 'Benchy';

  const loader = new STLLoader();
  loader.load(
    path,
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
      benchy.name = modelLabel;
      benchy.userData.modelType = type;
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
      console.error('Failed to load sample STL', err);
    }
  );
}

