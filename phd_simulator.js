(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const semesterEl = document.getElementById('semester');
  const energyEl = document.getElementById('energy');
  const motivationEl = document.getElementById('motivation');
  const fundingEl = document.getElementById('funding');
  const trustEl = document.getElementById('trust');
  const researchEl = document.getElementById('research');
  const ideasEl = document.getElementById('ideas');

  const panelTitle = document.getElementById('panel-title');
  const panelText = document.getElementById('panel-text');
  const cardArea = document.getElementById('card-area');
  const actionBtn = document.getElementById('action-btn');

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND_Y = 470;
  const HIGH_JUMP_EXTRA = -3.8;
  const RESEARCH_PER_DATA = 6;
  const SUCCESS_RESEARCH_BONUS = 2;
  const DEEPWORK_RESEARCH_BONUS = 10;
  const BURNOUT_THRESHOLD = 34;
  const LOW_ENERGY_SWEAT_THRESHOLD = 35;

  const keys = { w: false, a: false, s: false, d: false };
  let audioCtx = null;

  const state = {
    phase: 'intro',
    semester: 1,
    maxSemesters: 4,
    stats: {
      energy: 100,
      motivation: 100,
      funding: 50,
      trust: 50,
      research: 0,
      ideas: 10,
    },
    run: null,
    message: '',
    burnoutCount: 0,
    pendingRunMods: null,
    currentEvent: null,
    betweenAnimTime: 0,
    betweenParticles: [],
    endAnimTime: 0,
    endParticles: [],
    endWon: false,
  };

  const cards = [
    {
      title: 'Deep Work Sprint',
      text: `+${DEEPWORK_RESEARCH_BONUS} research, heavy energy/motivation cost, and a much calmer run.`,
      apply(stats, run) {
        run.hazardRate *= 0.45;
        run.enemyRate *= 0.50;
        run.semesterResearchBonus += DEEPWORK_RESEARCH_BONUS;
        stats.energy -= 16;
        stats.motivation -= 20;
      },
    },
    {
      title: 'Sleep Discipline',
      text: '+20 energy, +6 motivation, slower pace, lower hazards, and reduced burnout risk.',
      apply(stats, run) {
        stats.energy += 20;
        stats.motivation += 6;
        run.scrollSpeed -= 0.8;
        run.hazardRate -= 0.010;
        run.enemyRate -= 0.004;
        run.energyFlatPenalty = Math.max(6, run.energyFlatPenalty - 7);
        run.energyDistancePenaltyMul *= 0.6;
        run.motivationHitPenalty = Math.max(1, run.motivationHitPenalty - 1);
        run.burnoutThresholdAdjust = -8;
      },
    },
    {
      title: 'Conference Trip',
      text: '+18 trust, +16 funding, +1 research. Next run has more coins but slightly more enemies.',
      apply(stats, run) {
        stats.trust += 18;
        stats.funding += 16;
        stats.research += 1;
        stats.ideas += 18;
        run.enemyRate += 0.003;
        run.pickupRate += 0.012;
        run.targetDistance -= 120;
      },
    },
    {
      title: 'Risky Experiment',
      text: 'Huge coin upside, many more obstacles/enemies, and a much longer semester run.',
      apply(_stats, run) {
        run.pickupRate += 0.028;
        run.enemyRate += 0.019;
        run.hazardRate += 0.021;
        run.targetDistance += 1400;
      },
    },
    {
      title: 'TA Duty',
      text: '+18 funding, -10 energy, shorter semester target.',
      apply(stats, run) {
        stats.funding += 18;
        stats.energy -= 10;
        run.targetDistance -= 250;
      },
    },
    {
      title: 'Mentor Feedback',
      text: '+16 trust, +12 motivation, +2 research. Easier run with jump boost and fewer hazards.',
      apply(stats, run) {
        stats.trust += 16;
        stats.motivation += 12;
        stats.research += 2;
        stats.ideas += 14;
        run.jumpBonus -= 2.2;
        run.hazardRate -= 0.012;
        run.enemyRate -= 0.006;
        run.scrollSpeed -= 0.45;
        run.energyFlatPenalty = Math.max(8, run.energyFlatPenalty - 4);
        run.trustBaseSuccess += 2;
      },
    },
  ];

  const betweenSemesterChoices = [
    {
      title: 'Recovery Week',
      text: 'Recover mentally before next term.',
      effect:
        '+14 energy, +10 motivation. Next run is calmer but has fewer coin opportunities.',
      apply(stats) {
        stats.energy += 14;
        stats.motivation += 10;
        return {
          scrollSpeed: -0.6,
          hazardRate: -0.006,
          enemyRate: -0.003,
          pickupRate: -0.008,
        };
      },
    },
    {
      title: 'Grant Sprint',
      text: 'Spend break on funding and advisor updates.',
      effect:
        '+16 funding, +8 trust. Next run has extra admin pressure (more turtles).',
      apply(stats) {
        stats.funding += 16;
        stats.trust += 8;
        return {
          turtleRate: 0.010,
          enemyRate: 0.002,
          targetDistance: 180,
        };
      },
    },
    {
      title: 'Early Research Push',
      text: 'Use break to pre-run experiments.',
      effect:
        '+3 research now, -10 energy, -10 motivation. Next run has more coins and hazards.',
      apply(stats) {
        stats.research += 3;
        stats.energy -= 10;
        stats.motivation -= 10;
        stats.ideas += 8;
        return {
          pickupRate: 0.014,
          hazardRate: 0.010,
          enemyRate: 0.004,
          targetDistance: 220,
        };
      },
    },
    {
      title: 'Read Papers',
      text: 'Spend break reading broadly to generate ideas.',
      effect:
        '+30 ideas, +4 trust, -6 motivation. Higher future coin density but also higher hazard density.',
      apply(stats) {
        stats.ideas += 30;
        stats.trust += 4;
        stats.motivation -= 6;
        return {};
      },
    },
  ];

  const semesterEvents = [
    {
      name: 'Helpful Collaborator',
      description: 'A collaborator helps unblock your workflow. Hazards are much lower this semester.',
      apply(stats, run) {
        run.hazardRate *= 0.45;
        run.enemyRate *= 0.75;
        stats.motivation += 6;
      },
    },
    {
      name: 'Reviewer Drama',
      description: 'Reviewer comments are brutal. More hazards and less motivation.',
      apply(stats, run) {
        run.hazardRate += 0.028;
        run.enemyRate += 0.01;
        stats.motivation -= 8;
      },
    },
    {
      name: 'Equipment Failure',
      description: 'Lab equipment downtime increases admin burden.',
      apply(stats, run) {
        run.turtleRate += 0.02;
        run.pickupRate *= 0.9;
        stats.energy -= 6;
      },
    },
    {
      name: 'Unexpected Grant Win',
      description: 'Grant funding arrives. Better support this semester.',
      apply(stats, run) {
        stats.funding += 14;
        stats.trust += 6;
        run.enemyRate *= 0.9;
      },
    },
    {
      name: 'Quiet Semester',
      description: 'Nothing unusual happens.',
      apply() {},
    },
  ];

  function clampStats() {
    state.stats.energy = Math.max(0, Math.min(120, state.stats.energy));
    state.stats.motivation = Math.max(0, Math.min(120, state.stats.motivation));
    state.stats.funding = Math.max(0, Math.min(150, state.stats.funding));
    state.stats.trust = Math.max(0, Math.min(120, state.stats.trust));
    state.stats.research = Math.max(0, Math.min(140, state.stats.research));
    state.stats.ideas = Math.max(0, Math.min(220, state.stats.ideas));
  }

  function updateHUD() {
    semesterEl.textContent = String(state.semester);
    energyEl.textContent = String(Math.round(state.stats.energy));
    motivationEl.textContent = String(Math.round(state.stats.motivation));
    fundingEl.textContent = String(Math.round(state.stats.funding));
    trustEl.textContent = String(Math.round(state.stats.trust));
    researchEl.textContent = String(Math.round(state.stats.research));
    ideasEl.textContent = String(Math.round(state.stats.ideas));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
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

  function soundHazardHit() {
    playTone(250, 0.09, 'sawtooth', 0.06, 120);
  }

  function soundJump() {
    playTone(360, 0.06, 'triangle', 0.035, 460);
  }

  function soundHighJump() {
    playTone(300, 0.11, 'square', 0.045, 620);
  }

  function soundCoin() {
    playTone(720, 0.05, 'triangle', 0.03, 980);
  }

  function soundSemesterSuccess() {
    playTone(420, 0.08, 'triangle', 0.04, 620);
    setTimeout(() => playTone(620, 0.1, 'triangle', 0.045, 820), 60);
  }

  function soundSemesterFail() {
    playTone(330, 0.09, 'sawtooth', 0.04, 220);
    setTimeout(() => playTone(220, 0.12, 'sawtooth', 0.05, 130), 70);
  }

  function soundEvent() {
    playTone(520, 0.06, 'square', 0.03, 700);
  }

  function sampleCards(count) {
    const pool = [...cards];
    const selected = [];
    while (selected.length < count && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(i, 1)[0]);
    }
    return selected;
  }

  function sampleEvent() {
    const i = Math.floor(Math.random() * semesterEvents.length);
    return semesterEvents[i];
  }

  function initBetweenAnimation() {
    state.betweenAnimTime = 0;
    state.betweenParticles = [];
    const count = 22;
    for (let i = 0; i < count; i += 1) {
      state.betweenParticles.push({
        x: rand(20, WIDTH - 20),
        y: rand(40, HEIGHT - 40),
        w: rand(12, 26),
        h: rand(8, 16),
        vx: rand(-0.3, 0.3),
        vy: rand(-0.45, -0.08),
        rot: rand(-0.3, 0.3),
        vr: rand(-0.012, 0.012),
        alpha: rand(0.2, 0.6),
      });
    }
  }

  function initEndAnimation(won) {
    state.endAnimTime = 0;
    state.endWon = won;
    state.endParticles = [];
    const count = won ? 34 : 24;
    for (let i = 0; i < count; i += 1) {
      state.endParticles.push({
        x: rand(30, WIDTH - 30),
        y: won ? rand(120, 300) : rand(260, 430),
        vx: rand(-1.4, 1.4),
        vy: won ? rand(-3.8, -1.8) : rand(-0.4, 0.5),
        size: rand(5, 12),
        alpha: rand(0.35, 0.9),
      });
    }
  }

  function makeRun() {
    const semesterScale = 1 + (state.semester - 1) * 0.13;
    const motivationFactor = Math.max(0.75, state.stats.motivation / 100);
    const energyFactor = Math.max(0.75, state.stats.energy / 100);
    const ideaFactor = Math.max(0, Math.min(1, (state.stats.ideas - 10) / 100));
    const ideaCurve = Math.pow(ideaFactor, 2.25);
    const coinRateByIdeas = 0.0015 + ideaCurve * 0.3 + (state.semester - 1) * 0.003;
    const coinDrivenHazard = coinRateByIdeas * 0.42;
    const coinDrivenEnemy = coinRateByIdeas * 0.34;
    const coinDrivenTurtle = coinRateByIdeas * 0.20;

    const run = {
      scrollSpeed: 5.2 * semesterScale * (2 - motivationFactor) + (state.semester - 1) * 0.85,
      gravity: 0.55,
      moveSpeed: 6.1 * motivationFactor + (state.semester - 1) * 0.55,
      jumpVel: -11.8,
      jumpBonus: 0,
      targetDistance: (3200 + (state.semester - 1) * 450) * 2,
      hazardRate: 0.034 * semesterScale + coinDrivenHazard,
      enemyRate: 0.028 * semesterScale + coinDrivenEnemy,
      pickupRate: coinRateByIdeas,
      turtleRate: 0.010 + (state.semester - 1) * 0.008 + coinDrivenTurtle,
      semesterResearchBonus: 0,
      hitsTaken: 0,
      jumpCount: 0,
      pickups: 0,
      distance: 0,
      invulnFrames: 0,
      hitFlashFrames: 0,
      slowTimer: 0,
      energyDrain: 0.016 * (2 - energyFactor),
      energyFlatPenalty: 16,
      energyHitPenalty: 15,
      energyDistancePenaltyMul: 0.05,
      motivationBaseSuccess: 2,
      motivationBaseFail: -14,
      motivationHitPenalty: 10,
      fundingBaseSuccess: 4,
      fundingBaseFail: -8,
      trustBaseSuccess: 4,
      trustBaseFail: -12,
      burnoutThresholdAdjust: 0,
      player: {
        x: 150,
        y: 410,
        w: 28,
        h: 44,
        vx: 0,
        vy: 0,
        onGround: false,
      },
      entities: [],
      entityCursor: WIDTH + 120,
      ideaFactor,
      ideaCurve,
      nextGuaranteedDataAt: 980 - ideaCurve * 820,
    };

    if (state.pendingRunMods) {
      run.scrollSpeed += state.pendingRunMods.scrollSpeed || 0;
      run.hazardRate += state.pendingRunMods.hazardRate || 0;
      run.enemyRate += state.pendingRunMods.enemyRate || 0;
      run.pickupRate += state.pendingRunMods.pickupRate || 0;
      run.turtleRate += state.pendingRunMods.turtleRate || 0;
      run.targetDistance += state.pendingRunMods.targetDistance || 0;
      state.pendingRunMods = null;
    }

    run.scrollSpeed = Math.max(2.8, run.scrollSpeed);
    run.moveSpeed = Math.max(3.8, run.moveSpeed);
    run.hazardRate = Math.max(0.004, run.hazardRate);
    run.enemyRate = Math.max(0.002, run.enemyRate);
    run.pickupRate = Math.max(0.004, run.pickupRate);
    run.turtleRate = Math.max(0.001, run.turtleRate);
    run.targetDistance = Math.max(3600, run.targetDistance);

    return run;
  }

  function rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnEntity(run) {
    const roll = Math.random();
    if (roll < run.hazardRate) {
      run.entities.push({
        type: 'spike',
        x: run.entityCursor,
        y: GROUND_Y - 14,
        w: 40,
        h: 14,
      });
      run.entityCursor += rand(65, 120);
      return;
    }

    if (roll < run.hazardRate + run.enemyRate) {
      const demonRoll = Math.random();
      if (demonRoll < 0.42) {
        const y = Math.random() < 0.35 ? rand(350, 400) : GROUND_Y - 34;
        run.entities.push({
          type: 'enemy',
          x: run.entityCursor,
          y,
          w: 30,
          h: 34,
          baseY: y,
        });
      } else if (demonRoll < 0.74) {
        const baseY = rand(250, 360);
        run.entities.push({
          type: 'demon_bat',
          x: run.entityCursor,
          y: baseY,
          w: 34,
          h: 22,
          baseY,
        });
      } else {
        const baseY = GROUND_Y - 42;
        run.entities.push({
          type: 'demon_brute',
          x: run.entityCursor,
          y: baseY,
          w: 36,
          h: 42,
          baseY,
        });
      }
      run.entityCursor += rand(90, 160);
      return;
    }

    if (roll < run.hazardRate + run.enemyRate + run.turtleRate) {
      run.entities.push({
        type: 'turtle',
        x: run.entityCursor,
        y: GROUND_Y - 26,
        w: 32,
        h: 26,
      });
      run.entityCursor += rand(75, 140);
      return;
    }

    if (roll < run.hazardRate + run.enemyRate + run.turtleRate + run.pickupRate) {
      run.entities.push({
        type: 'data',
        x: run.entityCursor,
        y: rand(290, 410),
        w: 18,
        h: 18,
      });
      run.entityCursor += rand(45, 85);
      return;
    }

    run.entityCursor += rand(30, 60);
  }

  function beginCardDraft() {
    state.phase = 'card';
    state.run = makeRun();
    state.currentEvent = sampleEvent();
    state.currentEvent.apply(state.stats, state.run);
    soundEvent();
    clampStats();
    updateHUD();
    const options = sampleCards(3);

    panelTitle.textContent = `Semester ${state.semester}: Choose a Strategy Card`;
    panelText.textContent = `Random Event: ${state.currentEvent.name}. ${state.currentEvent.description} Pick one card, then run the semester platform challenge for coins.`;
    cardArea.innerHTML = '';

    options.forEach((card) => {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = `<h3>${card.title}</h3><p>${card.text}</p>`;
      btn.addEventListener('click', () => {
        card.apply(state.stats, state.run);
        clampStats();
        startRun();
      });
      cardArea.appendChild(btn);
    });

    actionBtn.textContent = 'Skip Card';
    actionBtn.onclick = () => startRun();
  }

  function beginBetweenSemesterChoice() {
    state.phase = 'between';
    initBetweenAnimation();
    panelTitle.textContent = `Between Semesters ${state.semester - 1} -> ${state.semester}`;
    panelText.textContent = 'Choose how you spend the break before your next semester.';
    cardArea.innerHTML = '';

    betweenSemesterChoices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = `<h3>${choice.title}</h3><p>${choice.text}</p><p>${choice.effect}</p>`;
      btn.addEventListener('click', () => {
        const mods = choice.apply(state.stats);
        state.pendingRunMods = mods;
        clampStats();
        updateHUD();
        beginCardDraft();
      });
      cardArea.appendChild(btn);
    });

    actionBtn.textContent = 'Take Neutral Break';
    actionBtn.disabled = false;
    actionBtn.onclick = () => {
      state.pendingRunMods = null;
      beginCardDraft();
    };
  }

  function startRun() {
    state.phase = 'run';
    state.message = '';
    cardArea.innerHTML = '';
    panelTitle.textContent = `Semester ${state.semester} In Progress`;
    panelText.textContent = 'Run to the semester finish marker. Faster pace, denser threats, and more coins.';
    actionBtn.textContent = 'Running...';
    actionBtn.disabled = true;
  }

  function motivationEnergyFactor() {
    const m = state.stats.motivation;
    if (m <= 80) return 1;
    const reduction = Math.min(0.6, (m - 80) * 0.015);
    return 1 - reduction;
  }

  function applyJumpFatigue() {
    const jumpEnergyCost = Math.max(1, Math.round(3 * motivationEnergyFactor()));
    state.stats.energy -= jumpEnergyCost;
    state.stats.motivation -= 3;
    clampStats();
    updateHUD();
    if (state.stats.energy <= 0 || state.stats.motivation <= 0 || state.stats.funding <= 0 || state.stats.trust <= 0) {
      endGame(false, 'You burned out from sustained effort.');
      return true;
    }
    return false;
  }

  function finishSemester(success) {
    const run = state.run;
    if (success) {
      soundSemesterSuccess();
    } else {
      soundSemesterFail();
    }
    const baseResearch =
      run.pickups * RESEARCH_PER_DATA + (success ? SUCCESS_RESEARCH_BONUS : 0) + run.semesterResearchBonus;

    state.stats.research += baseResearch;
    state.stats.funding += success ? run.fundingBaseSuccess : run.fundingBaseFail;
    state.stats.funding -= run.hitsTaken * 1.5;
    state.stats.trust += success ? run.trustBaseSuccess : run.trustBaseFail;
    state.stats.trust -= run.hitsTaken * 2;

    clampStats();

    let burnoutTriggered = false;
    const burnoutThreshold = BURNOUT_THRESHOLD + run.burnoutThresholdAdjust;
    if (state.stats.energy <= burnoutThreshold || state.stats.motivation <= burnoutThreshold) {
      burnoutTriggered = true;
      state.burnoutCount += 1;
      const burnoutDrop = 12 + state.burnoutCount * 5;
      state.stats.research -= burnoutDrop;
      state.stats.trust -= 5;
      state.stats.funding -= 4;
      clampStats();
    }

    updateHUD();

    if (state.stats.energy <= 0 || state.stats.motivation <= 0 || state.stats.funding <= 0 || state.stats.trust <= 0) {
      return endGame(false, 'You burned out or lost support before finishing the PhD.');
    }

    if (state.burnoutCount >= 2) {
      return endGame(false, 'Repeated burnout derailed your PhD trajectory.');
    }

    if (state.semester >= state.maxSemesters) {
      if (state.stats.research >= 100) {
        return endGame(true, 'You defended successfully. Congratulations, Dr.!');
      }
      return endGame(false, 'You reached the final year, but research progress was insufficient.');
    }

    state.phase = 'semester_result';
    state.run = null;
    panelTitle.textContent = `Semester ${state.semester} ${success ? 'Completed' : 'Crashed'}`;
    panelText.textContent = burnoutTriggered
      ? `Coin pickups: ${run.pickups}, hits: ${run.hitsTaken}, jumps: ${run.jumpCount}. Burnout triggered: research regressed and support dropped.`
      : `Coin pickups: ${run.pickups}, hits: ${run.hitsTaken}, jumps: ${run.jumpCount}. Research +${Math.round(baseResearch)}.`;
    actionBtn.textContent = 'Next Semester';
    actionBtn.disabled = false;
    actionBtn.onclick = () => {
      state.semester += 1;
      updateHUD();
      beginBetweenSemesterChoice();
    };
  }

  function endGame(won, text) {
    state.phase = won ? 'win' : 'lose';
    initEndAnimation(won);
    panelTitle.textContent = won ? 'Thesis Defended' : 'Program Ended';
    panelText.textContent = text;
    actionBtn.textContent = 'Restart Program';
    actionBtn.disabled = false;
    cardArea.innerHTML = '';
    actionBtn.onclick = () => {
      state.semester = 1;
      state.stats = { energy: 100, motivation: 100, funding: 50, trust: 50, research: 0, ideas: 10 };
      state.run = null;
      state.message = '';
      state.burnoutCount = 0;
      state.pendingRunMods = null;
      state.currentEvent = null;
      state.endParticles = [];
      state.endAnimTime = 0;
      updateHUD();
      beginCardDraft();
    };
  }

  function updateRun() {
    const run = state.run;
    const p = run.player;
    const exhausted = state.stats.energy <= LOW_ENERGY_SWEAT_THRESHOLD;

    if (run.distance >= run.targetDistance) {
      finishSemester(true);
      return;
    }

    if (run.slowTimer > 0) run.slowTimer -= 1;
    const speedFactor = (run.slowTimer > 0 ? 0.58 : 1) * (exhausted ? 0.15 : 1);
    p.vx = 0;
    if (keys.a) p.vx = -run.moveSpeed * speedFactor;
    if (keys.d) p.vx = run.moveSpeed * speedFactor;

    if (!exhausted && keys.w && p.onGround) {
      p.vy = run.jumpVel + run.jumpBonus;
      p.onGround = false;
      run.jumpCount += 1;
      soundJump();
      if (applyJumpFatigue()) return;
    }

    if (keys.s && !p.onGround) p.vy += 0.4;

    p.vy += run.gravity;
    if (p.vy > 12) p.vy = 12;

    p.x += p.vx;
    if (p.x < 20) p.x = 20;
    if (p.x + p.w > WIDTH - 20) p.x = WIDTH - 20 - p.w;

    p.y += p.vy;
    p.onGround = false;

    if (p.y + p.h >= GROUND_Y) {
      p.y = GROUND_Y - p.h;
      p.vy = 0;
      p.onGround = true;
    }

    run.distance += run.scrollSpeed;

    if (run.distance >= run.nextGuaranteedDataAt) {
      run.entities.push({
        type: 'data',
        x: WIDTH + rand(40, 140),
        y: rand(260, 410),
        w: 18,
        h: 18,
      });
      run.nextGuaranteedDataAt += rand(620 - run.ideaCurve * 450, 860 - run.ideaCurve * 620);
    }

    while (run.entityCursor - run.distance < WIDTH + 120) {
      spawnEntity(run);
    }

    for (const e of run.entities) {
      e.x -= run.scrollSpeed;
      if (e.type === 'enemy') {
        e.y = e.baseY + Math.sin((run.distance + e.x) * 0.01) * 6;
      } else if (e.type === 'demon_bat') {
        e.y = e.baseY + Math.sin((run.distance + e.x) * 0.026) * 16;
      } else if (e.type === 'demon_brute') {
        e.y = e.baseY + Math.sin((run.distance + e.x) * 0.012) * 2;
      }
    }

    if (run.invulnFrames > 0) run.invulnFrames -= 1;

    const kept = [];
    for (const e of run.entities) {
      if (e.x + e.w < -20) continue;

      if (rectHit(p, e)) {
        if (e.type === 'data') {
          run.pickups += 1;
          soundCoin();
          continue;
        }
        if (e.type === 'turtle') {
          run.slowTimer = Math.max(run.slowTimer, 70);
          kept.push(e);
          continue;
        }
        if (run.invulnFrames <= 0) {
          run.hitsTaken += 1;
          run.invulnFrames = 50;
          run.hitFlashFrames = 16;
          soundHazardHit();
          const hazardEnergyCost = Math.max(1, Math.round(run.energyHitPenalty * motivationEnergyFactor()));
          state.stats.energy -= hazardEnergyCost;
          state.stats.motivation -= run.motivationHitPenalty;
          clampStats();
          updateHUD();
          if (
            state.stats.energy <= 0 ||
            state.stats.motivation <= 0 ||
            state.stats.funding <= 0 ||
            state.stats.trust <= 0
          ) {
            endGame(false, 'You were overwhelmed by semester hazards.');
            return;
          }
          p.vy = -6;
          p.x = Math.max(20, p.x - 26);
          if (run.hitsTaken >= 3) {
            finishSemester(false);
            return;
          }
        }
      }

      kept.push(e);
    }
    run.entities = kept;

    updateHUD();
  }

  function drawRun() {
    const run = state.run;
    if (!run) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      return;
    }
    const exhausted = state.stats.energy <= LOW_ENERGY_SWEAT_THRESHOLD;

    const semesterThemes = [
      {
        skyTop: '#0b0d18',
        skyMid: '#191c34',
        skyBot: '#25253a',
        moon: '#d7ddf9',
        mountain: '#1e2239',
        silhouette: '#1a1c2f',
        ground: '#2a2c3f',
        groundDetail: '#1d1f2f',
      },
      {
        skyTop: '#0f0a1a',
        skyMid: '#2a1834',
        skyBot: '#3a2540',
        moon: '#f0c6ff',
        mountain: '#2b1e3b',
        silhouette: '#241831',
        ground: '#332541',
        groundDetail: '#23182c',
      },
      {
        skyTop: '#061319',
        skyMid: '#122835',
        skyBot: '#1f3f4a',
        moon: '#bde9ea',
        mountain: '#1a2d36',
        silhouette: '#14252e',
        ground: '#203743',
        groundDetail: '#15252d',
      },
      {
        skyTop: '#13060e',
        skyMid: '#311224',
        skyBot: '#492137',
        moon: '#ffd2b2',
        mountain: '#351a2a',
        silhouette: '#2a1422',
        ground: '#452737',
        groundDetail: '#2c1824',
      },
    ];
    const theme = semesterThemes[Math.min(semesterThemes.length - 1, Math.max(0, state.semester - 1))];

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(0.55, theme.skyMid);
    sky.addColorStop(1, theme.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Moon and glow.
    const moonX = WIDTH - 150;
    const moonY = 92;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 90);
    moonGlow.addColorStop(0, 'rgba(220, 226, 255, 0.45)');
    moonGlow.addColorStop(1, 'rgba(220, 226, 255, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.moon;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountains.
    ctx.fillStyle = theme.mountain;
    for (let i = 0; i < 9; i += 1) {
      const x = i * 150 - (run.distance * 0.07) % 150 - 60;
      const peakY = 230 + ((i * 37) % 70);
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 8);
      ctx.lineTo(x + 48, peakY);
      ctx.lineTo(x + 108, GROUND_Y + 8);
      ctx.fill();
    }

    // Mid-ground spooky trees and ruins.
    ctx.fillStyle = theme.silhouette;
    for (let i = 0; i < 10; i += 1) {
      const tx = i * 120 - (run.distance * 0.22) % 120 + 20;
      const baseY = GROUND_Y - 10;
      ctx.fillRect(tx, baseY - 65, 8, 65);
      ctx.beginPath();
      ctx.moveTo(tx + 4, baseY - 48);
      ctx.lineTo(tx - 18, baseY - 70);
      ctx.lineTo(tx + 3, baseY - 62);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx + 4, baseY - 36);
      ctx.lineTo(tx + 24, baseY - 56);
      ctx.lineTo(tx + 6, baseY - 49);
      ctx.fill();
      if (i % 3 === 1) {
        ctx.fillRect(tx + 20, baseY - 40, 12, 40);
        ctx.fillRect(tx + 34, baseY - 24, 5, 24);
      }
    }

    // Uneven haunted ground silhouette.
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = theme.groundDetail;
    for (let i = 0; i < 14; i += 1) {
      const x = i * 80 - (run.distance * 0.34) % 80;
      const w = 40 + (i % 3) * 16;
      const h = 5 + (i % 4) * 4;
      ctx.fillRect(x, GROUND_Y - h, w, h);
    }

    // Low fog layer.
    const fog = ctx.createLinearGradient(0, GROUND_Y - 70, 0, HEIGHT);
    fog.addColorStop(0, 'rgba(190, 200, 255, 0)');
    fog.addColorStop(1, 'rgba(180, 190, 240, 0.15)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, GROUND_Y - 70, WIDTH, HEIGHT - GROUND_Y + 70);

    for (const e of run.entities) {
      if (e.type === 'spike') {
        ctx.fillStyle = '#b14d72';
        const n = Math.floor(e.w / 10);
        for (let i = 0; i < n; i += 1) {
          const sx = e.x + i * 10;
          ctx.beginPath();
          ctx.moveTo(sx, e.y + e.h);
          ctx.lineTo(sx + 5, e.y);
          ctx.lineTo(sx + 10, e.y + e.h);
          ctx.fill();
        }
      } else if (e.type === 'enemy') {
        ctx.fillStyle = '#6d3554';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#111';
        ctx.fillRect(e.x + 6, e.y + 12, 4, 4);
        ctx.fillRect(e.x + 19, e.y + 12, 4, 4);
      } else if (e.type === 'demon_bat') {
        ctx.fillStyle = '#4b2d5c';
        ctx.fillRect(e.x + 6, e.y + 6, e.w - 12, e.h - 10);
        ctx.beginPath();
        ctx.moveTo(e.x + 4, e.y + 8);
        ctx.lineTo(e.x - 8, e.y + 16);
        ctx.lineTo(e.x + 4, e.y + 18);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x + e.w - 4, e.y + 8);
        ctx.lineTo(e.x + e.w + 8, e.y + 16);
        ctx.lineTo(e.x + e.w - 4, e.y + 18);
        ctx.fill();
        ctx.fillStyle = '#f1d7f9';
        ctx.fillRect(e.x + 10, e.y + 10, 3, 3);
        ctx.fillRect(e.x + e.w - 13, e.y + 10, 3, 3);
      } else if (e.type === 'demon_brute') {
        ctx.fillStyle = '#5b2c2c';
        ctx.fillRect(e.x, e.y + 8, e.w, e.h - 8);
        ctx.fillStyle = '#7f3a3a';
        ctx.fillRect(e.x + 4, e.y, e.w - 8, 14);
        ctx.fillStyle = '#f3d5bf';
        ctx.fillRect(e.x + 8, e.y + 12, 4, 4);
        ctx.fillRect(e.x + e.w - 12, e.y + 12, 4, 4);
      } else if (e.type === 'turtle') {
        ctx.fillStyle = '#2f6a52';
        ctx.fillRect(e.x, e.y + 8, e.w, e.h - 8);
        ctx.fillStyle = '#1d4a3a';
        ctx.fillRect(e.x + 4, e.y, e.w - 8, 12);
        ctx.fillStyle = '#0d0d0d';
        ctx.fillRect(e.x + 6, e.y + 12, 4, 4);
        ctx.fillRect(e.x + e.w - 10, e.y + 12, 4, 4);
      } else if (e.type === 'data') {
        ctx.fillStyle = '#79b8ff';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#274f8c';
        ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
      }
    }

    const p = run.player;
    const blink = run.invulnFrames > 0 && run.invulnFrames % 8 < 4;
    if (!blink) {
      ctx.fillStyle = '#d73e3e';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#2647b1';
      ctx.fillRect(p.x + 4, p.y + 18, p.w - 8, p.h - 20);
      ctx.fillStyle = '#f4d7b3';
      ctx.fillRect(p.x + 6, p.y + 4, p.w - 12, 10);
      if (state.stats.energy <= LOW_ENERGY_SWEAT_THRESHOLD) {
        const sweatShift = Math.sin(run.distance * 0.06) * 2;
        ctx.fillStyle = '#8dd3ff';
        ctx.beginPath();
        ctx.arc(p.x + p.w - 2, p.y + 8 + sweatShift, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x + p.w + 2, p.y + 13 + sweatShift, 1.9, 0, Math.PI * 2);
        ctx.fill();

        const bubbleW = 122;
        const bubbleH = 24;
        const bubbleX = p.x - 44;
        const bubbleY = p.y - 34;
        ctx.fillStyle = 'rgba(14, 18, 34, 0.9)';
        ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);
        ctx.beginPath();
        ctx.moveTo(p.x + 8, bubbleY + bubbleH);
        ctx.lineTo(p.x + 14, bubbleY + bubbleH + 8);
        ctx.lineTo(p.x + 20, bubbleY + bubbleH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#9db4e8';
        ctx.strokeRect(bubbleX, bubbleY, bubbleW, bubbleH);
        ctx.fillStyle = '#eef3ff';
        ctx.font = '12px sans-serif';
        ctx.fillText('I am exhausted', bubbleX + 10, bubbleY + 16);
      }
    }

    if (run.hitFlashFrames > 0) {
      run.hitFlashFrames -= 1;
      ctx.fillStyle = 'rgba(215, 50, 50, 0.16)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const progressRatio = Math.min(1, run.distance / run.targetDistance);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(20, 20, WIDTH - 40, 14);
    ctx.fillStyle = '#8db3ff';
    ctx.fillRect(20, 20, (WIDTH - 40) * progressRatio, 14);
    ctx.fillStyle = '#eef2ff';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `Semester progress ${Math.round(progressRatio * 100)}% | Hits ${run.hitsTaken}/3 | Coins ${run.pickups}${
        run.slowTimer > 0 ? ' | Slowed by admin duty' : ''
      }${exhausted ? ' | Exhausted: no jump' : ''}${
        exhausted && run.slowTimer <= 0 ? ' | Very slow' : ''
      }`,
      24,
      18
    );
  }

  function drawBetweenAnimation() {
    state.betweenAnimTime += 1;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#151a34');
    bg.addColorStop(1, '#0f1224');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Desk strip at bottom.
    ctx.fillStyle = '#2c2a35';
    ctx.fillRect(0, HEIGHT - 92, WIDTH, 92);
    ctx.fillStyle = '#3a3444';
    ctx.fillRect(0, HEIGHT - 92, WIDTH, 12);

    // Semester transition line.
    const t = (Math.sin(state.betweenAnimTime * 0.04) + 1) / 2;
    const barW = WIDTH - 140;
    const barX = 70;
    const barY = 88;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = '#859cff';
    ctx.fillRect(barX, barY, Math.max(40, barW * (0.2 + 0.6 * t)), 14);

    ctx.fillStyle = '#edf1ff';
    ctx.font = 'bold 22px sans-serif';
    const txt = `Planning Semester ${state.semester}`;
    const wobble = Math.sin(state.betweenAnimTime * 0.06) * 3;
    ctx.fillText(txt, 70, 56 + wobble);

    // Floating paper notes.
    for (const p of state.betweenParticles) {
      p.x += p.vx + Math.sin((state.betweenAnimTime + p.x) * 0.01) * 0.06;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y + p.h < 0) {
        p.y = HEIGHT - 100 + rand(0, 70);
        p.x = rand(20, WIDTH - 20);
      }
      if (p.x < -30) p.x = WIDTH + 20;
      if (p.x > WIDTH + 30) p.x = -20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#dde4ff';
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeStyle = '#7988b4';
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawEndAnimation() {
    state.endAnimTime += 1;
    const won = state.endWon;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    if (won) {
      bg.addColorStop(0, '#1a2146');
      bg.addColorStop(1, '#2a3c72');
    } else {
      bg.addColorStop(0, '#170f1d');
      bg.addColorStop(1, '#2a1d2a');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = won ? '#2f355f' : '#2b2030';
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

    // Simple character pose.
    const cx = WIDTH * 0.48;
    const cy = GROUND_Y - 44;
    ctx.fillStyle = won ? '#da4f4f' : '#6f6279';
    ctx.fillRect(cx, cy, 30, 44);
    ctx.fillStyle = '#f2d3b1';
    ctx.fillRect(cx + 7, cy - 12, 16, 12);
    ctx.fillStyle = '#2b376d';
    ctx.fillRect(cx + 5, cy + 18, 20, 26);

    if (won) {
      const bob = Math.sin(state.endAnimTime * 0.08) * 3;
      ctx.fillStyle = '#f6de7a';
      ctx.beginPath();
      ctx.arc(cx + 14, cy - 38 + bob, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1f39';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('PhD!', cx + 46, cy - 20 + bob);
    } else {
      const drip = 5 + Math.sin(state.endAnimTime * 0.12) * 2;
      ctx.fillStyle = '#8aa0d2';
      ctx.beginPath();
      ctx.arc(cx + 15, cy - 20, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx + 14, cy - 16, 2, drip);
      ctx.fillStyle = '#f0c9cc';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Burnout...', cx + 44, cy - 18);
    }

    // Particles: confetti for win, ash/rain for lose.
    for (const p of state.endParticles) {
      p.x += p.vx;
      p.y += p.vy;
      if (won) {
        p.vy += 0.05;
        if (p.y > HEIGHT - 30) {
          p.y = rand(60, 180);
          p.x = rand(30, WIDTH - 30);
          p.vy = rand(-3.8, -1.8);
        }
      } else {
        p.vy += 0.015;
        if (p.y > HEIGHT - 40) {
          p.y = rand(80, 200);
          p.x = rand(20, WIDTH - 20);
          p.vy = rand(0.2, 1.1);
        }
      }
      if (p.x < -10) p.x = WIDTH + 10;
      if (p.x > WIDTH + 10) p.x = -10;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = won ? '#ffe28d' : '#9ea6bc';
      ctx.fillRect(p.x, p.y, p.size, won ? p.size : Math.max(2, p.size * 0.35));
      ctx.globalAlpha = 1;
    }
  }

  function frame() {
    if (state.phase === 'run') {
      updateRun();
      drawRun();
    } else if (state.phase === 'between') {
      drawBetweenAnimation();
    } else if (state.phase === 'win' || state.phase === 'lose') {
      drawEndAnimation();
    } else {
      drawRun();
    }
    requestAnimationFrame(frame);
  }

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k in keys) {
      keys[k] = down;
      e.preventDefault();
    }
    if (
      down &&
      k === 'k' &&
      state.phase === 'run' &&
      state.run &&
      state.run.player.onGround &&
      state.stats.energy > LOW_ENERGY_SWEAT_THRESHOLD
    ) {
      state.run.jumpCount += 1;
      state.run.player.vy = state.run.jumpVel + state.run.jumpBonus + HIGH_JUMP_EXTRA;
      state.run.player.onGround = false;
      soundHighJump();
      applyJumpFatigue();
      e.preventDefault();
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  actionBtn.onclick = () => {
    if (state.phase === 'intro') {
      updateHUD();
      beginCardDraft();
    }
  };

  updateHUD();
  frame();
})();
