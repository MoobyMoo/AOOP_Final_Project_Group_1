// The locker mirror uses a separate rig and the existing renderer. Only changed views
// are drawn/read back, so an idle mirror adds no recurring WebGL draw calls.
import * as THREE from "three";
import { G } from "../core/state";
import { createRig } from "../actors/rig";

export function createAppearance(host: HTMLElement) {
  host.innerHTML = `<section class="lv-mirror" aria-label="Current appearance">
    <h3>Current appearance</h3><p>Your current look and equipped gear</p>
    <canvas width="420" height="560" tabindex="0" role="img" aria-label="Current character. Drag or use left and right arrow keys to rotate."></canvas>
    <div class="lv-mirror-controls"><span>Drag to rotate</span><button class="b3" type="button">Front view</button></div>
  </section>`;
  const canvas = host.querySelector("canvas")!, front = host.querySelector("button")!;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(canvas.width, canvas.height), pixels = new Uint8Array(image.data.length);
  const scene = new THREE.Scene(), turn = new THREE.Group(); scene.add(turn);
  scene.add(new THREE.HemisphereLight("#fff3e0", "#665340", 2));
  const key = new THREE.DirectionalLight("#ffe5c8", 3.2); key.position.set(2, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight("#b6d5ff", 1.6); rim.position.set(-3, 3, -2); scene.add(rim);
  const rig = createRig("monkey", G.save.look); turn.add(rig.root);
  const floorGeo = new THREE.CylinderGeometry(0.8, 0.85, 0.08, 48);
  const floorMat = new THREE.MeshStandardMaterial({ color: "#65503c", roughness: 0.85 });
  const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.y = -0.07; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(29, canvas.width / canvas.height, 0.05, 30);
  const rt = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  let lookKey = "", gearKey = "", yaw = 0, dirty = true, stopped = false, frame = 0, last = 0;
  let pointer: number | null = null, lastX = 0;

  function draw() {
    const r = G.stage.renderer;
    const previous = r.getRenderTarget(), clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    const viewport = r.getViewport(new THREE.Vector4()), scissor = r.getScissor(new THREE.Vector4()), scissorTest = r.getScissorTest();
    try {
      turn.rotation.y = yaw;
      r.setRenderTarget(rt); r.setScissorTest(false); r.setClearColor(0x000000, 0);
      r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, canvas.width, canvas.height, pixels);
      const row = canvas.width * 4;
      for (let y = 0; y < canvas.height; y++) image.data.set(pixels.subarray((canvas.height - y - 1) * row, (canvas.height - y) * row), y * row);
      ctx.putImageData(image, 0, 0);
    } finally {
      r.setRenderTarget(previous); r.setClearColor(clear, alpha);
      r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest);
    }
  }
  function update(now: number) {
    if (stopped) return;
    if (!host.isConnected) { dispose(); return; }
    frame = requestAnimationFrame(update);
    if (host.hidden || G.scene !== "bunker" || now - last < 1000 / 30) return;
    last = now;
    const look = JSON.stringify(G.save.look), gear = JSON.stringify(G.save.gear);
    if (look !== lookKey || gear !== gearKey) {
      if (look !== lookKey) rig.setLook?.(G.save.look);
      rig.setGear?.(G.save.gear);
      rig.pose({ time: 1.3, speed: 0, moveYaw: 0, faceYaw: 0, action: "idle", actionT: 0, armed: "none", flash: 0 });
      // Frame all angles consistently, including the backpack, tail and headwear.
      turn.rotation.y = 0; scene.updateMatrixWorld(true);
      // Rig culling boxes are intentionally oversized for combat animations. Use
      // actual posed vertices and visible gear for this close-up camera instead.
      const box = new THREE.Box3();
      rig.root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true); });
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()), width = Math.max(size.x, size.z);
      const distance = Math.max(size.y, width / cam.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.3;
      cam.position.set(0, center.y + 0.15, distance); cam.lookAt(0, center.y, 0);
      lookKey = look; gearKey = gear; dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || pointer !== null) return;
    e.preventDefault(); e.stopPropagation(); canvas.focus({ preventScroll: true });
    pointer = e.pointerId; lastX = e.clientX; canvas.setPointerCapture(pointer); canvas.classList.add("turning");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer) return;
    yaw += (e.clientX - lastX) / Math.max(1, canvas.getBoundingClientRect().width) * Math.PI * 2;
    lastX = e.clientX; dirty = true;
  });
  const release = () => { pointer = null; canvas.classList.remove("turning"); };
  canvas.addEventListener("lostpointercapture", release);
  canvas.addEventListener("pointerup", (e) => { if (e.pointerId === pointer) { canvas.releasePointerCapture(e.pointerId); release(); } });
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home") return;
    e.preventDefault(); e.stopPropagation();
    yaw = e.key === "Home" ? 0 : yaw + (e.key === "ArrowLeft" ? -1 : 1) * Math.PI / 12; dirty = true;
  });
  front.addEventListener("click", () => { yaw = 0; dirty = true; });
  frame = requestAnimationFrame(update);
  function dispose() {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame); rig.dispose(); rt.dispose(); floorGeo.dispose(); floorMat.dispose(); host.replaceChildren();
  }
  return dispose;
}
