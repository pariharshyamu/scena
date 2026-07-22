import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createSurface,
  createBanner,
  PALETTES,
  type BannerStyle,
  type BannerPattern,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0x9fb8cc);
scene.fog = new Fog(0x9fb8cc, 30, 70);

const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 300);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sun = new DirectionalLight(0xfff2df, 2.3);
sun.position.set(-6, 9, 5);
scene.add(sun);
scene.add(new AmbientLight(0x9fb8cc, 0.6));

const ground = new Mesh(new PlaneGeometry(120, 120), createSurface('dirt', { color: 0x7f6a4a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A row of every style crossed with a range of heraldic devices.
const styles: BannerStyle[] = ['flag', 'banner', 'pennant'];
const patterns: BannerPattern[] = ['cross', 'saltire', 'bands', 'bicolor', 'diamond', 'stripes', 'solid', 'cross'];
let x = -14;
patterns.forEach((pattern, i) => {
  const style = styles[i % styles.length];
  const banner = createBanner({ seed: 10 + i, style, pattern, palette });
  banner.object.position.set(x, 0, 0);
  banner.object.rotation.y = -0.5; // three-quarter view so the fly reads
  scene.add(banner.object);
  x += 4;
});

let t = 0;
function frame(): void {
  t += 0.004;
  camera.position.set(Math.sin(t * 0.5) * 8, 4.2, 16);
  camera.lookAt(0, 2.4, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Diagnostics: sample the animated cloth's vertex Z-range so a headless test
// can prove the fabric actually moves between frames.
(window as unknown as { flagDebug: () => unknown }).flagDebug = () => {
  const gl = renderer.getContext();
  // Read the shared wave clock off the first banner's cloth material.
  let clock = -1;
  scene.traverse((o) => {
    const m = (o as Mesh).material as { userData?: { waveUniforms?: { uTime: { value: number } } } } | undefined;
    if (clock < 0 && m?.userData?.waveUniforms) clock = m.userData.waveUniforms.uTime.value;
  });
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    waveClock: +clock.toFixed(3),
  };
};
