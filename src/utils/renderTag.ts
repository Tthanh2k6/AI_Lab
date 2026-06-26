import * as THREE from 'three';
import { TAG, TagWorld, TagCube, TagPlayer } from './tagGame';

// ============================================================================
// TAG RENDERER v2 — Phong cách Albert/Kai
//   • Phòng sáng (tường trắng / sàn tối) giống video
//   • 5 hộp màu sắc có thể đẩy
//   • Nhân vật hình hộp với mắt (giống Albert/Kai)
//   • Ray visualization (tắt/bật)
//   • Hiệu ứng tag: flash + ring nổ
// ============================================================================

// Kai = xanh dương sáng (Chaser)
const CHASER_COLOR    = 0x3b82f6;
const CHASER_EMISSIVE = 0x1d4ed8;

// Albert = cam sáng (Evader) — đủ nổi bật trên nền tối
const EVADER_COLOR    = 0xf97316;
const EVADER_EMISSIVE = 0xc2410c;

interface Board {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  last: string;
}

interface CubeMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  shadow: THREE.Mesh;
}

export class TagRenderer {
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  // Players
  private chaserGroup!: THREE.Group;
  private evaderGroup!: THREE.Group;
  private chaserBody!:  THREE.Mesh;
  private evaderBody!:  THREE.Mesh;
  private chaserShadow!: THREE.Mesh;
  private evaderShadow!: THREE.Mesh;
  private chaserGlow!: THREE.Mesh;
  private evaderGlow!: THREE.Mesh;

  // Cubes
  private cubeMeshes: CubeMesh[] = [];

  // UI Boards
  private timerBoard!: Board;
  private tagBoard!:   Board;
  private genBoard!:   Board;

  // Effects
  private flashRing!:  THREE.Mesh;
  private flashSphere!: THREE.Mesh;
  private particles: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];

  // Line from chaser to evader
  private distLine!: THREE.Line;
  private distLineMat!: THREE.LineBasicMaterial;

  // Jump trail
  private jumpTrailC: THREE.Mesh[] = [];
  private jumpTrailE: THREE.Mesh[] = [];

  // Lights (dynamic)
  private chaserLight!: THREE.PointLight;
  private evaderLight!: THREE.PointLight;
  private flashLight!:  THREE.PointLight;

  private disposed = false;
  private frameN = 0;

  constructor(container: HTMLElement, width?: number, height?: number) {
    this.container = container;
    const w = width  || container.clientWidth  || 960;
    const h = height || container.clientHeight || 600;

    this.scene = new THREE.Scene();
    // Phòng tối — nhân vật nổi bật rõ ràng
    this.scene.background = new THREE.Color(0x1a1d26);
    this.scene.fog = new THREE.FogExp2(0x1a1d26, 0.0035);

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 2000);
    this.camera.position.set(0, 155, 175);
    this.camera.lookAt(0, 0, -5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, true);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    container.appendChild(el);

    this._buildLights();
    this._buildRoom();
    this._buildCubeMeshes();
    this._buildPlayers();
    this._buildEffects();
    this._buildBoards();
    this._buildDistLine();
  }

  // ─── Lights ─────────────────────────────────────────────────────────────────

  private _buildLights() {
    // Ánh sáng môi trường thấp để phòng tối
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    this.scene.add(new THREE.HemisphereLight(0x8888ff, 0x223344, 0.3));

    // Đèn chính từ trên xuống
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(40, 150, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 180;
    sun.shadow.camera.left  = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top   =  d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.far   = 500;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Fill light yếu
    const fill = new THREE.DirectionalLight(0x334466, 0.3);
    fill.position.set(-60, 80, -50);
    this.scene.add(fill);

    // Đèn theo nhân vật — quan trọng để thấy Kai/Albert
    this.chaserLight = new THREE.PointLight(CHASER_COLOR, 2.5, 80, 1.5);
    this.scene.add(this.chaserLight);
    this.evaderLight = new THREE.PointLight(EVADER_COLOR, 2.5, 80, 1.5);
    this.scene.add(this.evaderLight);

    // Flash light (for tag effect)
    this.flashLight = new THREE.PointLight(0xfbbf24, 0, 100, 2);
    this.scene.add(this.flashLight);
  }

  // ─── Room ─────────────────────────────────────────────────────────────────

  private _buildRoom() {
    const L = TAG.LENGTH, W = TAG.WIDTH;

    // Sàn chính — tối, có kẻ ô
    const floorTex = this._makeFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Nền ngoài rộng hơn (tối hơn)
    const bgFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(L + 120, W + 100),
      new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 1.0 })
    );
    bgFloor.rotation.x = -Math.PI / 2;
    bgFloor.position.y = -0.05;
    this.scene.add(bgFloor);

    // Lưới sân sáng hơn để thấy trên nền tối
    const gridMat = new THREE.LineBasicMaterial({ color: 0x3b4a6a, transparent: true, opacity: 0.7 });
    const grid: THREE.Vector3[] = [];
    const nx = 10, nz = 7;
    for (let i = 0; i <= nx; i++) {
      const x = -L/2 + (L/nx)*i;
      grid.push(new THREE.Vector3(x, 0.05, -W/2), new THREE.Vector3(x, 0.05, W/2));
    }
    for (let j = 0; j <= nz; j++) {
      const z = -W/2 + (W/nz)*j;
      grid.push(new THREE.Vector3(-L/2, 0.05, z), new THREE.Vector3(L/2, 0.05, z));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), gridMat));

    // Vòng tròn giữa sân
    const circPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i/64)*Math.PI*2;
      circPts.push(new THREE.Vector3(Math.cos(a)*18, 0.06, Math.sin(a)*18));
    }
    const circMat = new THREE.LineBasicMaterial({ color: 0x4f7ecc, transparent: true, opacity: 0.8 });
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circPts), circMat));

    // Tường phòng (xám tối, tương phản với nhân vật)
    const wallH = TAG.WALL_H + 30;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e2536, roughness: 0.95 });

    const addWall = (geoW: number, geoH: number, pos: THREE.Vector3, ry: number) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(geoW, geoH), wallMat.clone());
      w.position.copy(pos);
      w.rotation.y = ry;
      w.receiveShadow = true;
      this.scene.add(w);
    };
    addWall(L + 8, wallH, new THREE.Vector3(0, wallH/2, -W/2), 0);
    addWall(L + 8, wallH, new THREE.Vector3(0, wallH/2,  W/2), Math.PI);
    addWall(W + 8, wallH, new THREE.Vector3(-L/2, wallH/2, 0), Math.PI/2);
    addWall(W + 8, wallH, new THREE.Vector3( L/2, wallH/2, 0), -Math.PI/2);

    // Viền sàn phát sáng nhẹ
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.6 });
    const edgePts = [
      new THREE.Vector3(-L/2, 0.12, -W/2), new THREE.Vector3( L/2, 0.12, -W/2),
      new THREE.Vector3( L/2, 0.12, -W/2), new THREE.Vector3( L/2, 0.12,  W/2),
      new THREE.Vector3( L/2, 0.12,  W/2), new THREE.Vector3(-L/2, 0.12,  W/2),
      new THREE.Vector3(-L/2, 0.12,  W/2), new THREE.Vector3(-L/2, 0.12, -W/2),
    ];
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edgePts), edgeMat));
  }

  private _makeFloorTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    // Nền tối
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 256);
    // Kẻ ô sáng nhẹ
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256);
      ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(TAG.LENGTH / 32, TAG.WIDTH / 32);
    return tex;
  }

  // ─── Cube Meshes ─────────────────────────────────────────────────────────

  private _buildCubeMeshes() {
    const cubeCount = TAG.NUM_CUBES;
    const colors = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6];

    for (let i = 0; i < cubeCount; i++) {
      const group = new THREE.Group();
      const s = TAG.CUBE_SIZE;

      // Main body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({
          color: colors[i] ?? 0xaaaaaa,
          roughness: 0.45,
          metalness: 0.15,
          emissive: colors[i] ?? 0xaaaaaa,
          emissiveIntensity: 0.45,
        })
      );
      body.position.y = s / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Edge wireframe
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
      );
      edges.position.y = s / 2;
      group.add(edges);

      // Shadow circle on floor
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(s * 0.6, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.08;

      this.scene.add(group);
      this.scene.add(shadow);
      this.cubeMeshes.push({ group, body, shadow });
    }
  }

  // ─── Players ─────────────────────────────────────────────────────────────

  private _buildCharacter(color: number, emissive: number, label: string): THREE.Group {
    const g = new THREE.Group();
    const W = TAG.PLAYER_R * 2, H = TAG.PLAYER_H;

    // Thân chính — emissive cao để nổi trên nền tối
    const bodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.15,
      emissive, emissiveIntensity: 0.6,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, W), bodyMat);
    body.position.y = H / 2;
    body.castShadow = true;
    g.add(body);

    // Viền phát sáng (outline BackSide)
    const glowMat = new THREE.MeshBasicMaterial({
      color: emissive, transparent: true, opacity: 0.22, side: THREE.BackSide,
    });
    const glowBody = new THREE.Mesh(new THREE.BoxGeometry(W * 1.14, H * 1.1, W * 1.14), glowMat);
    glowBody.position.y = H / 2;
    g.add(glowBody);

    // Mắt
    const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    for (const dz of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(W * 0.18, 10, 10), eyeMat);
      eye.position.set(W * 0.52, H * 0.65, dz * W * 0.24);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(W * 0.09, 8, 8), pupilMat);
      pupil.position.set(W * 0.64, H * 0.65, dz * W * 0.24);
      g.add(pupil);
    }

    // Tên hiện phía trên đầu (canvas texture, luôn quay về camera)
    const nc = document.createElement('canvas');
    nc.width = 128; nc.height = 52;
    const nctx = nc.getContext('2d')!;
    nctx.clearRect(0, 0, 128, 52);
    // Nền nhỏ
    nctx.fillStyle = label === 'KAI' ? 'rgba(59,130,246,0.85)' : 'rgba(249,115,22,0.85)';
    nctx.beginPath();
    nctx.roundRect(4, 4, 120, 44, 8);
    nctx.fill();
    nctx.fillStyle = '#ffffff';
    nctx.font = 'bold 28px sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(label, 64, 26);
    const nameTex = new THREE.CanvasTexture(nc);
    const nameMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.8, W * 0.65),
      new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false })
    );
    nameMesh.position.set(0, H + W * 0.65, 0);
    g.add(nameMesh);

    this.scene.add(g);
    return g;
  }


  private _buildPlayers() {
    this.chaserGroup = this._buildCharacter(CHASER_COLOR, CHASER_EMISSIVE, 'KAI');
    this.evaderGroup = this._buildCharacter(EVADER_COLOR, EVADER_EMISSIVE, 'ALBERT');

    // Khởi tạo vị trí ban đầu ngay lập tức (không đợi lerp)
    const hl = TAG.LENGTH / 2;
    this.chaserGroup.position.set(-hl * 0.65, 0, 0);
    this.evaderGroup.position.set( hl * 0.65, 0, 0);

    // Glow circles dưới chân
    const cgMat = new THREE.MeshBasicMaterial({ color: CHASER_COLOR, transparent: true, opacity: 0.35, depthWrite: false });
    this.chaserGlow = new THREE.Mesh(new THREE.CircleGeometry(TAG.PLAYER_R * 2.8, 24), cgMat);
    this.chaserGlow.rotation.x = -Math.PI / 2;
    this.chaserGlow.position.y = 0.12;
    this.scene.add(this.chaserGlow);

    const egMat = new THREE.MeshBasicMaterial({ color: EVADER_COLOR, transparent: true, opacity: 0.35, depthWrite: false });
    this.evaderGlow = new THREE.Mesh(new THREE.CircleGeometry(TAG.PLAYER_R * 2.8, 24), egMat);
    this.evaderGlow.rotation.x = -Math.PI / 2;
    this.evaderGlow.position.y = 0.12;
    this.scene.add(this.evaderGlow);

    // Shadow
    const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
    this.chaserShadow = new THREE.Mesh(new THREE.CircleGeometry(TAG.PLAYER_R * 1.6, 20), shMat.clone());
    this.chaserShadow.rotation.x = -Math.PI / 2;
    this.chaserShadow.position.y = 0.06;
    this.scene.add(this.chaserShadow);
    this.evaderShadow = new THREE.Mesh(new THREE.CircleGeometry(TAG.PLAYER_R * 1.6, 20), shMat.clone());
    this.evaderShadow.rotation.x = -Math.PI / 2;
    this.evaderShadow.position.y = 0.06;
    this.scene.add(this.evaderShadow);
  }

  // ─── Effects ─────────────────────────────────────────────────────────────

  private _buildEffects() {
    this.flashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, depthWrite: false })
    );
    this.scene.add(this.flashSphere);

    this.flashRing = new THREE.Mesh(
      new THREE.TorusGeometry(12, 2, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, depthWrite: false })
    );
    this.flashRing.rotation.x = Math.PI / 2;
    this.scene.add(this.flashRing);
  }

  private _buildDistLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 3, 0),
    ]);
    this.distLineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.25 });
    this.distLine = new THREE.Line(geo, this.distLineMat);
    this.scene.add(this.distLine);
  }

  private _buildBoards() {
    const bz = -TAG.WIDTH / 2 + 0.5;
    this.timerBoard = this._makeBoard(24, 9, 0, 68, bz);
    this.tagBoard   = this._makeBoard(22, 8, 0, 56, bz);
    this.genBoard   = this._makeBoard(18, 6, 0, 46, bz);
  }

  private _makeBoard(wm: number, hm: number, x: number, y: number, z: number): Board {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wm, hm),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return { ctx, tex, last: '' };
  }

  private _drawBoard(b: Board, lines: { text: string; color: string; size: number; y: number }[], bg = '#1e293b') {
    const key = lines.map(l => l.text).join('|');
    if (b.last === key) return;
    b.last = key;
    const { ctx } = b;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 124);
    for (const line of lines) {
      ctx.fillStyle = line.color;
      ctx.font = `bold ${line.size}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, 128, line.y);
    }
    b.tex.needsUpdate = true;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private _lerpGroup(group: THREE.Group, wx: number, wy: number, wz: number, t = 0.35) {
    // NaN guard — nếu physics bị NaN, giữ nguyên vị trí cũ
    if (!isFinite(wx) || !isFinite(wy) || !isFinite(wz)) return;
    group.position.x += (wx  - group.position.x) * t;
    group.position.y += (wz  - group.position.y) * t; // physics-z → Three-y (height)
    group.position.z += (wy  - group.position.z) * t; // physics-y → Three-z (depth)
  }

  private _lerpAngle(group: THREE.Group, vx: number, vy: number) {
    if (Math.hypot(vx, vy) > 0.05) {
      const target = -Math.atan2(vy, vx);
      let diff = target - group.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      group.rotation.y += diff * 0.2;
    }
  }

  // ─── Tag particles ────────────────────────────────────────────────────────

  private _spawnTagParticles(px: number, py: number) {
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 0.8 + Math.random() * 1.5;
      const vx = Math.cos(a) * r * 0.4;
      const vy = 0.4 + Math.random() * 0.7;
      const vz = Math.sin(a) * r * 0.4;
      const s  = 0.8 + Math.random() * 1.0;
      const col = i % 3 === 0 ? 0xfbbf24 : i % 3 === 1 ? CHASER_COLOR : 0xffffff;
      const pm = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 })
      );
      pm.position.set(px, 5, py);
      pm.castShadow = false;
      this.scene.add(pm);
      this.particles.push({ m: pm, vx, vy, vz, life: 1.0 });
    }
  }

  private _updateParticles() {
    const alive: typeof this.particles = [];
    for (const p of this.particles) {
      p.m.position.x += p.vx;
      p.m.position.y += p.vy;
      p.m.position.z += p.vz;
      p.vy -= 0.035;
      if (p.m.position.y < 0.5 * p.life) {
        p.m.position.y = 0.5 * p.life;
        if (p.vy < 0) { p.vy = -p.vy * 0.28; }
        p.vx *= 0.82; p.vz *= 0.82;
      }
      p.m.rotation.x += 0.09; p.m.rotation.z += 0.07;
      p.life -= 0.025;
      const s = Math.max(0, p.life);
      p.m.scale.set(s, s, s);
      if (p.life > 0.02) {
        alive.push(p);
      } else {
        this.scene.remove(p.m);
        p.m.geometry.dispose();
        (p.m.material as THREE.Material).dispose();
      }
    }
    this.particles = alive;
  }

  private _clearParticles() {
    for (const p of this.particles) {
      this.scene.remove(p.m);
      p.m.geometry.dispose();
      (p.m.material as THREE.Material).dispose();
    }
    this.particles = [];
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  render(w: TagWorld) {
    if (this.disposed) return;
    this.frameN++;

    // ── Players ──
    this._lerpGroup(this.chaserGroup, w.chaser.x, w.chaser.y, w.chaser.z);
    this._lerpGroup(this.evaderGroup, w.evader.x, w.evader.y, w.evader.z);
    this._lerpAngle(this.chaserGroup, w.chaser.vx, w.chaser.vy);
    this._lerpAngle(this.evaderGroup, w.evader.vx, w.evader.vy);

    // Nameplate (index 5 của children nếu đủ): luôn nhìn về camera
    const billboard = (grp: THREE.Group) => {
      grp.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial
            && (child.material as THREE.MeshBasicMaterial).map) {
          // Chỉ áp dụng yaw theo camera (giữ x,z tilt bằng 0)
          child.rotation.set(0, this.camera.rotation.y, 0);
        }
      });
    };
    billboard(this.chaserGroup);
    billboard(this.evaderGroup);

    // Shadow + glow on ground
    this.chaserShadow.position.x = this.chaserGroup.position.x;
    this.chaserShadow.position.z = this.chaserGroup.position.z;
    this.evaderShadow.position.x = this.evaderGroup.position.x;
    this.evaderShadow.position.z = this.evaderGroup.position.z;
    // Scale shadow by height
    const csh = Math.max(0.3, 1 - w.chaser.z / 20);
    const esh = Math.max(0.3, 1 - w.evader.z / 20);
    this.chaserShadow.scale.set(csh, 1, csh);
    this.evaderShadow.scale.set(esh, 1, esh);

    this.chaserGlow.position.x = this.chaserGroup.position.x;
    this.chaserGlow.position.z = this.chaserGroup.position.z;
    this.evaderGlow.position.x = this.evaderGroup.position.x;
    this.evaderGlow.position.z = this.evaderGroup.position.z;

    // Dynamic lights follow players
    this.chaserLight.position.set(this.chaserGroup.position.x, 15, this.chaserGroup.position.z);
    this.evaderLight.position.set(this.evaderGroup.position.x, 15, this.evaderGroup.position.z);

    // Glow opacity based on tag cooldown
    const pulse = 0.5 + 0.5 * Math.sin(this.frameN * 0.08);
    const cGlow = this.chaserGlow.material as THREE.MeshBasicMaterial;
    cGlow.opacity = 0.2 + pulse * 0.15;
    const eGlow = this.evaderGlow.material as THREE.MeshBasicMaterial;
    const distNow = Math.hypot(w.chaser.x - w.evader.x, w.chaser.y - w.evader.y);
    const danger  = Math.max(0, 1 - distNow / 40);
    eGlow.opacity = 0.15 + danger * 0.4;
    // Evader glow turns redder when danger
    eGlow.color.setHSL(0.05 - danger * 0.05, 1, 0.5);

    // ── Cubes ──
    for (let i = 0; i < this.cubeMeshes.length && i < w.cubes.length; i++) {
      const cube = w.cubes[i];
      const cm   = this.cubeMeshes[i];
      const P = 0.32;
      cm.group.position.x += (cube.x - cm.group.position.x) * P;
      cm.group.position.z += (cube.y - cm.group.position.z) * P;
      cm.group.position.y = 0;
      cm.shadow.position.x = cm.group.position.x;
      cm.shadow.position.z = cm.group.position.z;
      // Rotate cube when moving
      const spd = Math.hypot(cube.vx, cube.vy);
      if (spd > 0.05) {
        cm.group.rotation.y += spd * 0.04;
      }
    }

    // ── Distance line ──
    const cPos = this.chaserGroup.position;
    const ePos = this.evaderGroup.position;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cPos.x, 4, cPos.z),
      new THREE.Vector3(ePos.x, 4, ePos.z),
    ]);
    this.distLine.geometry.dispose();
    this.distLine.geometry = lineGeo;
    this.distLineMat.opacity = Math.max(0.05, 0.5 * danger);
    const hue = 0.12 - danger * 0.12;
    this.distLineMat.color.setHSL(hue, 1, 0.55);

    // ── Tag flash ──
    if (w.tagFlashTicks > 0) {
      const t = w.tagFlashTicks / 48;
      this.flashSphere.position.set(w.tagFlashX, 5, w.tagFlashY);
      this.flashRing.position.set(w.tagFlashX, 3, w.tagFlashY);
      (this.flashSphere.material as THREE.MeshBasicMaterial).opacity = t * 0.75;
      (this.flashRing.material as THREE.MeshBasicMaterial).opacity   = t;
      const rs = 2.2 - t * 1.2;
      this.flashRing.scale.set(rs, rs, rs);
      this.flashLight.position.set(w.tagFlashX, 12, w.tagFlashY);
      this.flashLight.intensity = t * 3.0;
      // Spawn particles once
      if (w.tagFlashTicks === 47 && this.particles.length === 0) {
        this._spawnTagParticles(w.tagFlashX, w.tagFlashY);
      }
    } else {
      (this.flashSphere.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.flashRing.material as THREE.MeshBasicMaterial).opacity   = 0;
      this.flashLight.intensity = 0;
      if (this.particles.length > 0 && w.resetDelayTicks === 0) {
        // Only clear after delay is over
      }
    }
    this._updateParticles();

    // ── Boards ──
    const secs = Math.max(0, Math.ceil((TAG.MATCH_TICKS - w.tick) / 60));
    const mm   = Math.floor(secs / 60);
    const ss   = secs % 60;
    const timeStr = `${mm}:${String(ss).padStart(2, '0')}`;
    this._drawBoard(this.timerBoard, [
      { text: `⏱  ${timeStr}`, color: '#ffffff', size: 52, y: 64 },
    ]);
    this._drawBoard(this.tagBoard, [
      { text: `🔴 BẮT: ${w.matchTagCount} / ${TAG.MAX_TAGS}`, color: '#fbbf24', size: 36, y: 45 },
      { text: `🏆 KAI ${w.chaserWins}  :  ${w.evaderWins} ALBERT`, color: '#94a3b8', size: 22, y: 95 },
    ]);
    this._drawBoard(this.genBoard, [
      { text: `THẾ HỆ  #${w.generation}`, color: '#818cf8', size: 34, y: 64 },
    ]);

    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    if (this.disposed) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
  }

  dispose() {
    this.disposed = true;
    this._clearParticles();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
