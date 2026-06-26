import * as THREE from 'three';
import { SOCCER2, Soccer2World } from './soccer2';

// ============================================================================
// SOCCER 2 RENDERER — Three.js, tương tự Soccer 1 nhưng có:
//   • Hào quang xanh lá khi cầu thủ đang dẫn bóng (hasBall)
//   • Vòng đỏ indicator cooldown sút
// ============================================================================

const ORANGE = 0xff7a18;
const BLUE   = 0x2f86ff;

interface Board {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  last: string;
}

export class Soccer2Renderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private orangeMesh!: THREE.Group;
  private blueMesh!: THREE.Group;
  private ball!: THREE.Mesh;
  private ballShadow!: THREE.Mesh;
  private timerBoard!: Board;
  private scoreBoard!: Board;
  private genBoardL!: Board;
  private genBoardR!: Board;
  private particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
  private disposed = false;

  constructor(container: HTMLElement, width?: number, height?: number) {
    this.container = container;
    const w = width  || container.clientWidth  || 960;
    const h = height || container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f4f8);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 2000);
    this.camera.position.set(0, 120, 165);
    this.camera.lookAt(0, 0, -8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, true);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    container.appendChild(el);

    this.buildLights();
    this.buildRoom();
    this.buildGoals();
    this.buildBoards();
    this.buildEntities();
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9098a5, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(20, 120, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 160;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top  =  d; key.shadow.camera.bottom = -d;
    key.shadow.camera.far  = 600;
    this.scene.add(key);
  }

  private tileTexture(repeatX: number, repeatY: number): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#cdd5e0';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }

  private buildRoom() {
    const L = SOCCER2.LENGTH, W = SOCCER2.WIDTH;

    const roomFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(L + 60, W + 50),
      new THREE.MeshStandardMaterial({ color: 0xcdd5e0, roughness: 0.95 })
    );
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.y = -0.05;
    roomFloor.receiveShadow = true;
    this.scene.add(roomFloor);

    // Sàn sân — tối hơn Soccer 1 một chút
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({ color: 0x2d3038, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Lưới ô vuông xanh nhẹ trên sàn
    const lineMat = new THREE.LineBasicMaterial({ color: 0x5aefb0, transparent: true, opacity: 0.6 });
    const segs: THREE.Vector3[] = [];
    const nx = 10, nz = 5;
    for (let i = 0; i <= nx; i++) {
      const x = -L / 2 + (L / nx) * i;
      segs.push(new THREE.Vector3(x, 0.05, -W / 2), new THREE.Vector3(x, 0.05, W / 2));
    }
    for (let j = 0; j <= nz; j++) {
      const z = -W / 2 + (W / nz) * j;
      segs.push(new THREE.Vector3(-L / 2, 0.05, z), new THREE.Vector3(L / 2, 0.05, z));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), lineMat));

    const circlePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a) * 9, 0.06, Math.sin(a) * 9));
    }
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePts), lineMat));

    const VH     = 120;
    const WALL_X = L / 2 + 16.5;

    const makeWall = (geoW: number, pos: [number, number, number], rotY: number) => {
      const mat = new THREE.MeshStandardMaterial({ map: this.tileTexture(geoW / 10, VH / 10), roughness: 0.9 });
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(geoW, VH), mat);
      wall.position.set(...pos);
      wall.rotation.y = rotY;
      wall.receiveShadow = true;
      this.scene.add(wall);
    };
    makeWall(W + 28, [-WALL_X, VH / 2, 0], Math.PI / 2);
    makeWall(W + 28, [ WALL_X, VH / 2, 0], -Math.PI / 2);
    makeWall(WALL_X * 2 + 4, [0, VH / 2, -W / 2], 0);
    makeWall(WALL_X * 2 + 4, [0, VH / 2,  W / 2], Math.PI);
  }

  private netTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private buildGoal(color: number, sign: number) {
    const g = new THREE.Group();
    const gw = SOCCER2.GOAL_W, gh = SOCCER2.GOAL_H, R = 0.4, depth = 16;
    const lineX = sign * SOCCER2.LENGTH / 2;
    const backX = lineX + sign * depth;
    const frameMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.3,
      emissive: color,
      emissiveIntensity: 0.3
    });

    const cyl = (rad: number, len: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 12), frameMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      g.add(m);
    };

    // 2 Front vertical posts (cylinders)
    cyl(R, gh, lineX, gh / 2, -gw / 2);
    cyl(R, gh, lineX, gh / 2,  gw / 2);

    // Top crossbar
    cyl(R, gw, lineX, gh, 0, Math.PI / 2, 0, 0);

    // Bottom back bar
    cyl(R, gw, backX, R, 0, Math.PI / 2, 0, 0);

    // 2 Bottom side bars (on the ground)
    cyl(R, depth, (lineX + backX) / 2, R, -gw / 2, 0, 0, Math.PI / 2);
    cyl(R, depth, (lineX + backX) / 2, R,  gw / 2, 0, 0, Math.PI / 2);

    // 2 Diagonal side bars
    const diag = Math.hypot(depth, gh);
    const ang  = Math.atan2(-gh, sign * depth);
    cyl(R, diag, (lineX + backX) / 2, gh / 2, -gw / 2, 0, 0, ang + Math.PI / 2);
    cyl(R, diag, (lineX + backX) / 2, gh / 2,  gw / 2, 0, 0, ang + Math.PI / 2);

    // Net material with high-contrast repeating grid
    const netMat = new THREE.MeshBasicMaterial({
      map: this.netTexture(),
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const v = (x: number, y: number, z: number) => [x, y, z];
    const verts: number[] = [];
    const uvs: number[] = [];

    const quad = (a: number[], b: number[], c: number[], d: number[], uMax: number, vMax: number) => {
      verts.push(...a, ...b, ...c, ...a, ...c, ...d);
      uvs.push(0, 0,  uMax, 0,  uMax, vMax,  0, 0,  uMax, vMax,  0, vMax);
    };

    const tri = (a: number[], b: number[], c: number[], uMax: number, vMax: number) => {
      verts.push(...a, ...b, ...c);
      uvs.push(0, 0,  uMax, 0,  uMax, vMax);
    };

    const gridUnit = 1.6; // Kích thước ô lưới thực tế (1.6x1.6 đơn vị)

    // Back sloped net
    quad(
      v(lineX, gh, -gw / 2),
      v(lineX, gh, gw / 2),
      v(backX, 0, gw / 2),
      v(backX, 0, -gw / 2),
      gw / gridUnit,
      diag / gridUnit
    );

    // Bottom floor net
    quad(
      v(lineX, 0, -gw / 2),
      v(lineX, 0, gw / 2),
      v(backX, 0, gw / 2),
      v(backX, 0, -gw / 2),
      gw / gridUnit,
      depth / gridUnit
    );

    // Side triangle nets (Left & Right)
    tri(
      v(lineX, gh, -gw / 2),
      v(lineX, 0, -gw / 2),
      v(backX, 0, -gw / 2),
      depth / gridUnit,
      gh / gridUnit
    );
    tri(
      v(lineX, gh, gw / 2),
      v(lineX, 0, gw / 2),
      v(backX, 0, gw / 2),
      depth / gridUnit,
      gh / gridUnit
    );

    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    netGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    netGeo.computeVertexNormals();
    g.add(new THREE.Mesh(netGeo, netMat));

    this.scene.add(g);
  }

  private buildGoals() {
    this.buildGoal(ORANGE, -1);
    this.buildGoal(BLUE,    1);
  }

  private makeBoard(wm: number, hm: number, x: number, y: number, z: number, ry = 0): Board {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wm, hm),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.scene.add(mesh);
    return { ctx, tex, last: '' };
  }

  private drawTimerBoard(b: Board, text: string) {
    if (b.last === text) return;
    b.last = text;
    const ctx = b.ctx;
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#2d3139';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    
    // Clock Icon
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(60, 64, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(60, 64);
    ctx.lineTo(60, 48);
    ctx.moveTo(60, 64);
    ctx.lineTo(72, 64);
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 105, 68);
    b.tex.needsUpdate = true;
  }

  private drawSingleScoreBoard(b: Board, text: string, color: string) {
    if (b.last === text) return;
    b.last = text;
    const ctx = b.ctx;
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#2d3139';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    
    ctx.fillStyle = color;
    ctx.font = 'bold 84px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 68);
    b.tex.needsUpdate = true;
  }

  private drawGenBoard(b: Board, text: string) {
    if (b.last === text) return;
    b.last = text;
    const ctx = b.ctx;
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#2d3139';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 68);
    b.tex.needsUpdate = true;
  }

  private buildBoards() {
    const backZ = -SOCCER2.WIDTH / 2 + 0.6;
    this.timerBoard = this.makeBoard(16, 8, 0, 68, backZ, 0);
    this.scoreBoard = this.makeBoard(20, 10, 0, 54, backZ, 0);
    this.genBoardL  = this.makeBoard(16, 8, -SOCCER2.LENGTH / 2 + 18, 38, backZ, 0);
    this.genBoardR  = this.makeBoard(16, 8,  SOCCER2.LENGTH / 2 - 18, 38, backZ, 0);
  }

  private buildPlayer(color: number): THREE.Group {
    const g = new THREE.Group();
    const size = SOCCER2.PLAYER_R * 2;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * 1.2, size),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
    );
    body.position.y = size * 0.6;
    body.castShadow = true;
    g.add(body);

    const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const dz of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(size * 0.17, 12, 12), eyeMat);
      eye.position.set(size * 0.5, size * 0.78, dz * size * 0.25);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.085, 8, 8), pupilMat);
      pupil.position.set(size * 0.63, size * 0.78, dz * size * 0.25);
      g.add(pupil);
    }

    this.scene.add(g);
    return g;
  }

  private buildEntities() {
    this.orangeMesh = this.buildPlayer(ORANGE);
    this.blueMesh   = this.buildPlayer(BLUE);

    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(SOCCER2.BALL_R, 24, 24), ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    const spotMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (const dir of [[0, 1, 0], [0.9, 0.3, 0], [-0.9, 0.3, 0], [0, 0.3, 0.9], [0, 0.3, -0.9]]) {
      const spot = new THREE.Mesh(new THREE.CircleGeometry(SOCCER2.BALL_R * 0.42, 6), spotMat);
      const vv = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().multiplyScalar(SOCCER2.BALL_R * 0.99);
      spot.position.copy(vv);
      spot.lookAt(vv.clone().multiplyScalar(2));
      this.ball.add(spot);
    }

    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(SOCCER2.BALL_R, 16), shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.08;
    this.scene.add(this.ballShadow);
  }

  render(w: Soccer2World) {
    if (this.disposed) return;

    const P = 0.30; // lerp cầu thủ
    const B = 0.45; // lerp bóng

    const oG = this.orangeMesh;
    const bG = this.blueMesh;

    oG.position.x += (w.orange.x - oG.position.x) * P;
    oG.position.y += (w.orange.z - oG.position.y) * P; // nhảy theo trục Y
    oG.position.z += (w.orange.y - oG.position.z) * P;
    bG.position.x += (w.blue.x   - bG.position.x) * P;
    bG.position.y += (w.blue.z   - bG.position.y) * P; // nhảy theo trục Y
    bG.position.z += (w.blue.y   - bG.position.z) * P;

    const lerpAngle = (group: THREE.Group, vx: number, vy: number) => {
      if (Math.hypot(vx, vy) > 0.01) {
        const targetRY = -Math.atan2(vy, vx);
        let diff = targetRY - group.rotation.y;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        group.rotation.y += diff * 0.25;
      }
    };
    lerpAngle(oG, w.orange.vx, w.orange.vy);
    lerpAngle(bG, w.blue.vx,   w.blue.vy);

    // Bóng
    this.ball.position.x += (w.ball.x - this.ball.position.x) * B;
    this.ball.position.y += (w.ball.z - this.ball.position.y) * B;
    this.ball.position.z += (w.ball.y - this.ball.position.z) * B;
    this.ball.rotation.x += w.ball.vx * 0.08;
    this.ball.rotation.z -= w.ball.vy * 0.08;

    this.ballShadow.position.x += (w.ball.x - this.ballShadow.position.x) * B;
    this.ballShadow.position.z += (w.ball.y - this.ballShadow.position.z) * B;
    const sc = Math.max(0.4, 1 - (w.ball.z - SOCCER2.BALL_R) / 40);
    this.ballShadow.scale.set(sc, sc, sc);

    // Bảng điện tử
    const secs = Math.max(0, Math.ceil((SOCCER2.MATCH_TICKS - w.tick) / 60));
    this.drawTimerBoard(this.timerBoard, String(secs));
    this.drawGenBoard(this.scoreBoard, String(w.generation));
    this.drawSingleScoreBoard(this.genBoardL, String(w.scoreOrange), '#ff7a18');
    this.drawSingleScoreBoard(this.genBoardR, String(w.scoreBlue),   '#2f86ff');

    // Xử lý hiệu ứng phân rã cube cho kẻ thua cuộc
    if (w.loser !== null) {
      const loserMesh = w.loser === 'orange' ? this.orangeMesh : this.blueMesh;
      loserMesh.visible = false;

      // Spawn 64 hạt cube nhỏ (4x4x4) nếu chưa có hạt nào
      if (this.particles.length === 0) {
        const pos = loserMesh.position;
        const color = w.loser === 'orange' ? ORANGE : BLUE;
        
        // Quán tính vận tốc của cầu thủ khi thua cuộc
        const pVx = w.loser === 'orange' ? w.orange.vx : w.blue.vx;
        const pVy = w.loser === 'orange' ? w.orange.vz : w.blue.vz; // Y trong Three.js là vận tốc đứng z của physics
        const pVz = w.loser === 'orange' ? w.orange.vy : w.blue.vy; // Z trong Three.js là vận tốc ngang y của physics
        
        const size = SOCCER2.PLAYER_R * 2; // 6.0
        const pw = size / 4; // 1.5
        const ph = (size * 1.2) / 4; // 1.8
        const pd = size / 4; // 1.5

        for (let ix = 0; ix < 4; ix++) {
          for (let iy = 0; iy < 4; iy++) {
            for (let iz = 0; iz < 4; iz++) {
              // Ghép khít chính xác vào hình thể của cầu thủ
              const px = pos.x + (ix - 1.5) * pw;
              const py = pos.y + (iy - 1.5) * ph + size * 0.6; // Tâm khối hình hộp là size * 0.6
              const pz = pos.z + (iz - 1.5) * pd;
              
              const pGeo = new THREE.BoxGeometry(pw, ph, pd);
              const pMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.45,
                metalness: 0.05,
                emissive: color,
                emissiveIntensity: 0.15
              });
              const pm = new THREE.Mesh(pGeo, pMat);
              pm.position.set(px, py, pz);
              pm.castShadow = true;
              
              // Hướng bắn vụ nổ từ tâm ra ngoài
              const sx = (ix - 1.5) / 1.5;
              const sy = (iy - 1.5) / 1.5;
              const sz = (iz - 1.5) / 1.5;
              
              // Quán tính cầu thủ + lực vụ nổ hướng tâm + nhiễu ngẫu nhiên
              const vx = pVx + sx * 0.28 + (Math.random() - 0.5) * 0.15;
              const vy = pVy + sy * 0.28 + Math.random() * 0.2; // Lực tung lên nhẹ
              const vz = pVz + sz * 0.28 + (Math.random() - 0.5) * 0.15;
              
              this.scene.add(pm);
              this.particles.push({ mesh: pm, vx, vy, vz, life: 1.0 });
            }
          }
        }
      }
    } else {
      // Khi không có trận đấu kết thúc hoặc bắt đầu trận mới:
      this.orangeMesh.visible = true;
      this.blueMesh.visible = true;
      if (this.particles.length > 0) {
        this.particles.forEach(p => {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          if (Array.isArray(p.mesh.material)) p.mesh.material.forEach(m => m.dispose());
          else if (p.mesh.material) (p.mesh.material as THREE.Material).dispose();
        });
        this.particles = [];
      }
    }

    // Di chuyển và thu nhỏ hạt
    if (this.particles.length > 0) {
      this.particles.forEach(p => {
        p.mesh.position.x += p.vx;
        p.mesh.position.y += p.vy;
        p.mesh.position.z += p.vz;
        
        // Trọng lực kéo các hạt rơi xuống sàn
        p.vy -= 0.025;
        
        // Giảm kích thước và thời gian sống (1s = 60 frames)
        p.life -= 0.0165; 
        if (p.life < 0) p.life = 0;
        
        // Va chạm mặt sàn (y = 0)
        // Chiều cao thực tế là ph * life = 1.8 * life. Tiếp xúc sàn khi y <= 0.9 * life.
        const floorY = 0.9 * p.life;
        if (p.mesh.position.y < floorY) {
          p.mesh.position.y = floorY;
          if (p.vy < 0) {
            p.vy = -p.vy * 0.35; // Nảy nhẹ
            if (p.vy < 0.05) p.vy = 0;
          }
          // Ma sát trượt làm chậm chuyển động ngang
          p.vx *= 0.82;
          p.vz *= 0.82;
        }
        
        p.mesh.scale.set(p.life, p.life, p.life);
      });
    }

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
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    
    // Clean up particles
    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      const mat = p.mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else if (mat) mat.dispose();
    });
    this.particles = [];

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
