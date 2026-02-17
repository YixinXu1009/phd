# Browser Games

This repo currently contains:
- `index.html`: Mini Plumber Run
- `phd_simulator.html`: PhD Simulator (card + platform run hybrid)

## Run

```bash
cd "/Users/yixinxu/Documents/vibe coding"
python3 -m http.server 5173
```

Open:
- [http://localhost:5173/index.html](http://localhost:5173/index.html)
- [http://localhost:5173/phd_simulator.html](http://localhost:5173/phd_simulator.html)

## PhD Simulator Controls
- `W`: jump
- `A` / `D`: move
- `S`: fast-fall

Game loop:
1. Pick one strategy card each semester.
2. Survive the semester run (avoid hazards/enemies, collect data).
3. Manage Energy/Motivation/Funding/Advisor Trust while pushing Research to 100.
