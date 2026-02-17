(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const WORLD_WIDTH = 3600;
  const GRAVITY = 0.55;
  const MOVE_SPEED = 4.2;
  const JUMP_VEL = -11.5;
  const HIGH_JUMP_VEL = -15.2;
  const TERMINAL_FALL = 12;
  const BULLET_SPEED = 8.5;
  const SHOOT_COOLDOWN_FRAMES = 12;
  const GROUND_Y = 460;
  const SLOW_DURATION_FRAMES = 180;
  const SLOW_MULTIPLIER = 0.55;

  const keys = { w: false, a: false, s: false, d: false };
  let audioCtx = null;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function rangeOverlaps(aStart, aEnd, bStart, bEnd, pad = 0) {
    return aStart < bEnd + pad && aEnd > bStart - pad;
  }

  function buildGroundSegments(pits) {
    const sorted = [...pits].sort((a, b) => a.x - b.x);
    const segments = [];
    let cursor = 0;
    for (const pit of sorted) {
      if (pit.x > cursor) {
        segments.push({ x: cursor, w: pit.x - cursor, y: GROUND_Y });
      }
      cursor = pit.x + pit.w;
    }
    if (cursor < WORLD_WIDTH) {
      segments.push({ x: cursor, w: WORLD_WIDTH - cursor, y: GROUND_Y });
    }
    return segments.filter((s) => s.w > 80);
  }

  function generateLevel() {
    const startSafeEnd = 260;
    const goalX = WORLD_WIDTH - 130;
    const goalSafeStart = goalX - 220;

    const pits = [];
    let px = 420;
    while (px < WORLD_WIDTH - 420) {
      px += randInt(120, 260);
      if (px >= WORLD_WIDTH - 420) break;
      if (Math.random() < 0.42) {
        const w = randInt(60, 130);
        const candidate = { x: px, w };
        if (
          !rangeOverlaps(candidate.x, candidate.x + candidate.w, 0, startSafeEnd, 30) &&
          !rangeOverlaps(candidate.x, candidate.x + candidate.w, goalSafeStart, WORLD_WIDTH, 30)
        ) {
          pits.push(candidate);
        }
        px += w + randInt(110, 240);
      }
    }

    const platforms = [];
    let x = 220;
    while (x < WORLD_WIDTH - 260) {
      const w = randInt(95, 220);
      const y = randInt(240, 390);
      platforms.push({ x, y, w, h: 18 });
      x += w + randInt(90, 200);
    }

    const spikes = [];
    const spikeCount = randInt(8, 13);
    const groundSegments = buildGroundSegments(pits);
    for (let i = 0; i < spikeCount; i += 1) {
      if (Math.random() < 0.5 && groundSegments.length > 0) {
        const s = groundSegments[randInt(0, groundSegments.length - 1)];
        if (s.w < 90) continue;
        const w = randInt(30, 70);
        const minSX = Math.max(s.x + 18, startSafeEnd + 10);
        const maxSX = Math.min(s.x + s.w - w - 18, goalSafeStart - w - 20);
        if (maxSX <= minSX) continue;
        const sx = randInt(minSX, maxSX);
        spikes.push({ x: sx, y: GROUND_Y - 16, w, h: 16 });
      } else if (platforms.length > 0) {
        const p = platforms[randInt(0, platforms.length - 1)];
        if (p.w < 70) continue;
        const w = randInt(25, Math.min(65, p.w - 20));
        const minSX = Math.max(p.x + 10, startSafeEnd + 10);
        const maxSX = Math.min(p.x + p.w - w - 10, goalSafeStart - w - 20);
        if (maxSX <= minSX) continue;
        const sx = randInt(minSX, maxSX);
        spikes.push({ x: sx, y: p.y - 16, w, h: 16 });
      }
    }

    const supports = [
      ...platforms.map((p) => ({ x: p.x, w: p.w, y: p.y })),
      ...groundSegments.map((g) => ({ x: g.x, w: g.w, y: g.y })),
    ].filter((s) => s.w >= 120 && s.x > startSafeEnd + 60 && s.x + s.w < goalSafeStart);

    const enemies = [];
    const enemyCount = randInt(4, 7);
    for (let i = 0; i < enemyCount && supports.length > 0; i += 1) {
      const support = supports[randInt(0, supports.length - 1)];
      const w = 28;
      const h = 34;
      const patrolPad = 8;
      const minX = support.x + patrolPad;
      const maxX = support.x + support.w - patrolPad;
      if (maxX - minX < 80) continue;
      const ex = randInt(minX, maxX - w);
      enemies.push({
        x: ex,
        y: support.y - h,
        w,
        h,
        minX,
        maxX,
        vx: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.9),
      });
    }

    const turtles = [];
    const turtleCount = randInt(3, 5);
    for (let i = 0; i < turtleCount && supports.length > 0; i += 1) {
      const support = supports[randInt(0, supports.length - 1)];
      const w = 30;
      const h = 24;
      const patrolPad = 10;
      const minX = support.x + patrolPad;
      const maxX = support.x + support.w - patrolPad;
      if (maxX - minX < 90) continue;
      const tx = randInt(minX, maxX - w);
      turtles.push({
        x: tx,
        y: support.y - h,
        w,
        h,
        minX,
        maxX,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.55),
      });
    }

    return {
      groundY: GROUND_Y,
      platforms,
      pits,
      spikes,
      goal: { x: goalX, y: GROUND_Y - 130, w: 12, h: 130 },
      enemies,
      turtles,
    };
  }

  const initialPlayer = () => ({
    x: 70,
    y: 400,
    w: 28,
    h: 40,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
  });

  let player = initialPlayer();
  let level = generateLevel();
  let enemies = level.enemies.map((e) => ({ ...e }));
  let turtles = level.turtles.map((t) => ({ ...t }));
  let bullets = [];
  let shootCooldown = 0;
  let slowTimer = 0;
  let cameraX = 0;
  let gameState = 'playing';

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function isInPit(footX) {
    return level.pits.some((pit) => footX >= pit.x && footX <= pit.x + pit.w);
  }

  function restart() {
    player = initialPlayer();
    level = generateLevel();
    enemies = level.enemies.map((e) => ({ ...e }));
    turtles = level.turtles.map((t) => ({ ...t }));
    bullets = [];
    shootCooldown = 0;
    slowTimer = 0;
    gameState = 'playing';
    cameraX = 0;
    statusEl.textContent = 'Reach the flag. Avoid hazards.';
  }

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, duration, type, volume, sweepTo = null) {
    const ctxAudio = ensureAudio();
    if (!ctxAudio) return;
    const now = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function soundJump() {
    playTone(340, 0.09, 'square', 0.06, 520);
  }

  function soundShoot() {
    playTone(680, 0.07, 'square', 0.05, 460);
  }

  function soundEnemyHit() {
    playTone(220, 0.12, 'sawtooth', 0.06, 110);
  }

  function soundLose() {
    playTone(240, 0.2, 'triangle', 0.07, 80);
  }

  function soundWin() {
    const ctxAudio = ensureAudio();
    if (!ctxAudio) return;
    soundShoot();
    setTimeout(() => playTone(760, 0.08, 'square', 0.05, 980), 70);
    setTimeout(() => playTone(980, 0.12, 'square', 0.05, 1280), 140);
  }

  function shoot() {
    if (gameState !== 'playing') return;
    if (shootCooldown > 0) return;
    shootCooldown = SHOOT_COOLDOWN_FRAMES;
    soundShoot();

    const dir = player.facing >= 0 ? 1 : -1;
    bullets.push({
      x: player.x + (dir > 0 ? player.w : -8),
      y: player.y + 18,
      w: 8,
      h: 4,
      vx: BULLET_SPEED * dir,
      life: 85,
    });
  }

  function updatePlayer() {
    const speedScale = slowTimer > 0 ? SLOW_MULTIPLIER : 1;
    const effectiveMoveSpeed = MOVE_SPEED * speedScale;
    player.vx = 0;
    if (keys.a) {
      player.vx = -effectiveMoveSpeed;
      player.facing = -1;
    }
    if (keys.d) {
      player.vx = effectiveMoveSpeed;
      player.facing = 1;
    }

    if (keys.w && player.onGround) {
      player.vy = JUMP_VEL;
      player.onGround = false;
      soundJump();
    }

    if (keys.s && !player.onGround) {
      player.vy += 0.45;
    }

    player.vy += GRAVITY;
    if (player.vy > TERMINAL_FALL) player.vy = TERMINAL_FALL;

    // Horizontal move + wall collision against platforms only.
    player.x += player.vx;
    for (const p of level.platforms) {
      if (!rectsOverlap(player, p)) continue;
      if (player.vx > 0) player.x = p.x - player.w;
      if (player.vx < 0) player.x = p.x + p.w;
    }

    // Vertical move + floor/platform collision.
    player.y += player.vy;
    player.onGround = false;

    const floorRect = { x: 0, y: level.groundY, w: WORLD_WIDTH, h: HEIGHT - level.groundY };
    if (rectsOverlap(player, floorRect) && !isInPit(player.x + player.w / 2)) {
      if (player.vy >= 0) {
        player.y = level.groundY - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    for (const p of level.platforms) {
      if (!rectsOverlap(player, p)) continue;
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
        player.vy = 0;
      }
    }

    // World bounds.
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > WORLD_WIDTH) player.x = WORLD_WIDTH - player.w;

    if (player.y > HEIGHT + 120) {
      gameState = 'lost';
      statusEl.textContent = 'You fell! Press R to restart.';
      soundLose();
    }
  }

  function updateEnemies() {
    for (const e of enemies) {
      e.x += e.vx;
      if (e.x < e.minX || e.x + e.w > e.maxX) {
        e.vx *= -1;
      }

      if (gameState === 'playing' && rectsOverlap(player, e)) {
        gameState = 'lost';
        statusEl.textContent = 'Hit by enemy! Press R to restart.';
        soundLose();
      }
    }
  }

  function updateTurtles() {
    for (const t of turtles) {
      t.x += t.vx;
      if (t.x < t.minX || t.x + t.w > t.maxX) {
        t.vx *= -1;
      }

      if (gameState === 'playing' && rectsOverlap(player, t)) {
        slowTimer = SLOW_DURATION_FRAMES;
      }
    }
    if (slowTimer > 0) slowTimer -= 1;
  }

  function updateBullets() {
    if (shootCooldown > 0) shootCooldown -= 1;

    const nextBullets = [];
    for (const b of bullets) {
      b.x += b.vx;
      b.life -= 1;

      if (b.life <= 0 || b.x < -20 || b.x > WORLD_WIDTH + 20) continue;

      let hitPlatform = false;
      for (const p of level.platforms) {
        if (rectsOverlap(b, p)) {
          hitPlatform = true;
          break;
        }
      }
      if (hitPlatform) continue;

      let hitEnemyIndex = -1;
      for (let i = 0; i < enemies.length; i += 1) {
        if (rectsOverlap(b, enemies[i])) {
          hitEnemyIndex = i;
          break;
        }
      }
      if (hitEnemyIndex >= 0) {
        enemies.splice(hitEnemyIndex, 1);
        soundEnemyHit();
        continue;
      }

      nextBullets.push(b);
    }
    bullets = nextBullets;
  }

  function updateHazardsAndGoal() {
    if (gameState !== 'playing') return;

    for (const s of level.spikes) {
      if (rectsOverlap(player, s)) {
        gameState = 'lost';
        statusEl.textContent = 'Hit spikes! Press R to restart.';
        soundLose();
        return;
      }
    }

    const goalZone = { x: level.goal.x - 10, y: level.goal.y, w: 24, h: level.goal.h };
    if (rectsOverlap(player, goalZone)) {
      gameState = 'won';
      statusEl.textContent = 'You reached the flag! Press R to play again.';
      soundWin();
    }
  }

  function updateCamera() {
    const target = player.x - WIDTH * 0.35;
    cameraX += (target - cameraX) * 0.14;
    cameraX = Math.max(0, Math.min(cameraX, WORLD_WIDTH - WIDTH));
  }

  function drawBackground() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Sky gradient.
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#8fd4ff');
    g.addColorStop(1, '#d6f1ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Hills.
    ctx.fillStyle = '#84c98f';
    for (let i = 0; i < 12; i += 1) {
      const x = i * 320 - (cameraX * 0.35) % 320;
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT);
      ctx.quadraticCurveTo(x + 90, 320, x + 180, HEIGHT);
      ctx.fill();
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-cameraX, 0);

    // Ground with pits.
    ctx.fillStyle = '#6cba5f';
    ctx.fillRect(0, level.groundY, WORLD_WIDTH, HEIGHT - level.groundY);
    ctx.fillStyle = '#8f5b31';
    ctx.fillRect(0, level.groundY + 10, WORLD_WIDTH, HEIGHT - level.groundY);

    ctx.fillStyle = '#79c9ff';
    level.pits.forEach((pit) => {
      ctx.fillRect(pit.x, level.groundY, pit.w, HEIGHT - level.groundY);
    });

    // Platforms.
    level.platforms.forEach((p) => {
      ctx.fillStyle = '#bf8b4d';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#8f6432';
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    });

    // Spikes.
    level.spikes.forEach((s) => {
      ctx.fillStyle = '#d54b4b';
      const count = Math.floor(s.w / 10);
      for (let i = 0; i < count; i += 1) {
        const sx = s.x + i * 10;
        ctx.beginPath();
        ctx.moveTo(sx, s.y + s.h);
        ctx.lineTo(sx + 5, s.y);
        ctx.lineTo(sx + 10, s.y + s.h);
        ctx.fill();
      }
    });

    // Enemies.
    enemies.forEach((e) => {
      ctx.fillStyle = '#773f1f';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#f2d0a2';
      ctx.fillRect(e.x + 4, e.y + 7, e.w - 8, 10);
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x + 7, e.y + 12, 3, 3);
      ctx.fillRect(e.x + e.w - 10, e.y + 12, 3, 3);
    });

    turtles.forEach((t) => {
      ctx.fillStyle = '#2a9c50';
      ctx.fillRect(t.x, t.y + 8, t.w, t.h - 8);
      ctx.fillStyle = '#1f6f3a';
      ctx.fillRect(t.x + 3, t.y, t.w - 6, 12);
      ctx.fillStyle = '#101010';
      ctx.fillRect(t.x + 5, t.y + 12, 4, 4);
      ctx.fillRect(t.x + t.w - 9, t.y + 12, 4, 4);
    });

    bullets.forEach((b) => {
      ctx.fillStyle = '#ffe364';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#c58e00';
      ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    });

    // Goal flag.
    ctx.fillStyle = '#555';
    ctx.fillRect(level.goal.x, level.goal.y, level.goal.w, level.goal.h);
    ctx.fillStyle = '#f2db3a';
    ctx.fillRect(level.goal.x + level.goal.w, level.goal.y + 10, 44, 28);

    // Player.
    ctx.fillStyle = '#de3d3d';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#2346b0';
    ctx.fillRect(player.x + 4, player.y + 18, player.w - 8, 20);
    ctx.fillStyle = '#f5d2ac';
    ctx.fillRect(player.x + 6, player.y + 4, player.w - 12, 12);

    if (player.facing > 0) {
      ctx.fillStyle = '#b31212';
      ctx.fillRect(player.x + player.w - 6, player.y + 8, 6, 4);
    } else {
      ctx.fillStyle = '#b31212';
      ctx.fillRect(player.x, player.y + 8, 6, 4);
    }

    ctx.restore();

    if (gameState !== 'playing') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gameState === 'won' ? 'You Win!' : 'Game Over', WIDTH / 2, HEIGHT / 2 - 10);
      ctx.font = '20px sans-serif';
      ctx.fillText('Press R to restart', WIDTH / 2, HEIGHT / 2 + 30);
    }
  }

  function update() {
    if (gameState === 'playing') {
      updatePlayer();
      updateBullets();
      updateEnemies();
      updateTurtles();
      updateHazardsAndGoal();
      updateCamera();
    }
  }

  function frame() {
    update();
    drawBackground();
    drawWorld();
    requestAnimationFrame(frame);
  }

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k in keys) {
      keys[k] = down;
      e.preventDefault();
    }
    if (down && k === 'j') {
      shoot();
      e.preventDefault();
    }
    if (down && k === 'k' && gameState === 'playing' && player.onGround) {
      player.vy = HIGH_JUMP_VEL;
      player.onGround = false;
      soundJump();
      e.preventDefault();
    }
    if (down && k === 'r') restart();
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  frame();
})();
