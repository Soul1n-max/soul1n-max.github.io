// Живой 3D-Иван на экране входа (исходник; в сайт идёт собранный js/vendor/ivan3d.js, см. tools/ivan3d/README.md).
// Крутится мышкой, сам слегка поворачивается за курсором и покачивается, после отпускания плавно возвращается лицом к зрителю.
import { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Box3, Vector3, Group, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function mount(box, url) {
  const canvas = document.createElement('canvas');
  canvas.className = 'auth-ivan-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { return; } // нет WebGL — остаётся картинка
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  scene.add(new HemisphereLight(0xffffff, 0x3a2a2a, 1.6));
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);
  const rim = new DirectionalLight(0xff4a50, 1.4); rim.position.set(-3, 1.5, -2.5); scene.add(rim);

  const pivot = new Group(); scene.add(pivot);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw = 0, pitch = 0, drag = 0, dragV = 0, dragging = false, lastX = 0, lastY = 0, dragPitch = 0, cursor = 0;

  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    return true;
  };

  new GLTFLoader().load(url, gltf => {
    const model = gltf.scene;
    const b = new Box3().setFromObject(model), c = b.getCenter(new Vector3()), s = b.getSize(new Vector3());
    const k = 2 / s.y;
    model.scale.setScalar(k);
    model.position.set(-c.x * k, -c.y * k, -c.z * k);
    const face = new Group(); face.rotation.y = -Math.PI / 2 + 0.35; // в файле Иван смотрит вбок: разворачиваем к зрителю, чуть в сторону заголовка
    face.add(model); pivot.add(face);
    camera.position.set(0, 0.1, 2 / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.12 + Math.max(s.x, s.z) * k / 2);
    camera.lookAt(0, 0, 0);
    box.appendChild(canvas);
    box.classList.add('is-3d');
    requestAnimationFrame(loop);
  }, undefined, () => canvas.remove());

  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; dragV = 0; canvas.setPointerCapture(e.pointerId); box.classList.add('is-grab'); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    drag += dx * 0.012; dragV = dx * 0.012;
    dragPitch = Math.max(-0.35, Math.min(0.35, dragPitch + dy * 0.006));
  });
  const up = () => { dragging = false; box.classList.remove('is-grab'); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const hero = box.closest('.auth-hero') || document;
  hero.addEventListener('pointermove', e => {
    const r = box.getBoundingClientRect();
    cursor = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500));
  });

  const t0 = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || box.offsetParent === null || !size()) return; // экран входа скрыт — не рисуем
    const t = (now - t0) / 1000;
    if (!dragging) {
      drag += dragV; dragV *= 0.92;                // докручивается по инерции
      if (Math.abs(dragV) < 0.002) {               // затем возвращается лицом к зрителю
        const turns = Math.round(drag / (2 * Math.PI)) * 2 * Math.PI; // лишние полные обороты не откручиваем назад
        drag -= turns; yaw -= turns; drag *= 0.94;
      }
      dragPitch *= 0.92;
    }
    const idle = reduce ? 0 : Math.sin(t * 0.7) * 0.22;
    yaw += (cursor * 0.55 + idle + drag - yaw) * (dragging ? 0.5 : 0.08);
    pitch += (dragPitch - pitch) * 0.2;
    pivot.rotation.set(pitch, yaw, 0);
    pivot.position.y = reduce ? 0 : Math.sin(t * 1.75) * 0.05;
    renderer.render(scene, camera);
  }
}

window.mountIvan3D = mount;
