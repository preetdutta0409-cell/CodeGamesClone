# Codenames Clone

A real-time, multiplayer word-guessing game inspired by Codenames. Two teams
(Red and Blue) each have a spymaster who gives one-word clues to help their
operatives find their team's words on a shared 5x5 board — without touching
the other team's words, or the assassin.

This is a full working implementation:
- Node.js + Express server
- Socket.IO for real-time sync between all players
- Vanilla HTML/CSS/JS front end (no build step, no framework needed)
- Room codes so friends can join the same game from any browser/device
- Spymaster view (sees all colors) vs Operative view (only revealed colors)
- Turn logic, bonus guesses, win/lose conditions, live game log, and a
  "play again" flow that keeps the same room and players

---

## 1. Requirements

- [Node.js](https://nodejs.org) version 18 or newer (includes `npm`)

Check your version:

```bash
node -v
```

## 2. Install

Unzip this project, then from inside the project folder:

```bash
npm install
```

This downloads the two dependencies (`express` and `socket.io`) into a local
`node_modules` folder.

## 3. Run it

```bash
npm start
```

You should see:

```
Codenames clone running at http://localhost:3000
```

Open that URL in your browser. To play with others **on the same computer**,
just open more browser tabs/windows.

## 4. Play with friends on your local network

Anyone on the same Wi-Fi/network as you can join if you share your computer's
local IP address instead of `localhost`.

1. Find your local IP:
   - **Mac/Linux:** `ifconfig | grep inet` (look for something like `192.168.x.x`)
   - **Windows:** `ipconfig` (look for "IPv4 Address")
2. Start the server: `npm start`
3. Share `http://<your-ip>:3000` with friends on the same network.

## 5. Host it online (so anyone, anywhere, can join)

The app is a single small Node process, so it runs on almost any Node
hosting platform. A few easy free/cheap options:

### Render.com (simple, free tier available)
1. Push this project to a GitHub repo.
2. Create a new "Web Service" on Render, point it at your repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Render gives you a public URL — share it with friends.

### Railway.app
1. Push this project to a GitHub repo.
2. "New Project" → "Deploy from GitHub repo".
3. Railway auto-detects Node, runs `npm install` and `npm start`.
4. It gives you a public URL automatically.

### Fly.io / a VPS (DigitalOcean, EC2, etc.)
1. Copy the project to the server.
2. `npm install`
3. Run it persistently with a process manager, e.g.:
   ```bash
   npm install -g pm2
   pm2 start server.js --name codenames
   ```
4. Put it behind Nginx/Caddy for HTTPS and a domain name if you want.

The server reads the port from the `PORT` environment variable if set
(most hosts set this automatically), otherwise it defaults to `3000`.

## 6. How to play

1. One player clicks **Create a room** and gets a 4-letter room code.
2. Everyone else clicks **Join room** and enters that code.
3. Each player picks a team (Red/Blue) and a role:
   - **Spymaster** — one per team. Sees the color of every card and gives
     one-word clues with a number (e.g. "OCEAN — 2").
   - **Operative** — everyone else. Sees a plain board and clicks cards to
     guess, based on their spymaster's clue.
4. Once each team has at least one spymaster and one operative, anyone can
   click **Start game**.
5. Play proceeds in turns:
   - The active team's spymaster types a clue word and a number, then
     clicks **Give clue**.
   - That team's operatives click cards to guess. They get the clue's
     number of guesses, plus one bonus guess.
   - Guessing your own team's color lets you keep guessing (up to the
     limit). Guessing the other team's color, a neutral card, or the
     assassin ends your turn immediately.
   - Operatives can click **End turn** any time it's their turn to stop
     guessing early.
6. A team wins by revealing all of their own words first. Whoever reveals
   the **assassin** card immediately loses — the other team wins.
7. After a game ends, click **Play again** to reshuffle a new board with
   the same room and players.

## 7. Project structure

```
codenames/
├── server.js         # Express + Socket.IO server, all game logic & state
├── words.js          # Word bank used to build boards (400+ words)
├── package.json
├── public/
│   ├── index.html    # Lobby, team-select, and game screens
│   ├── style.css     # Visual styling (wood-table / spy theme)
│   └── client.js     # Front-end logic: sockets, rendering, interactions
└── README.md
```

All game state lives in server memory (per room). There's no database —
rooms are created when the first player creates them and are cleaned up
automatically once everyone disconnects. Restarting the server clears all
active games.

## 8. Notes & possible extensions

- The word list in `words.js` is an original list of common English nouns
  (not copied from any commercial product), so you're free to use, host,
  and modify this project.
- Everything currently lives in memory, so this is best for casual games
  with friends rather than a large persistent public deployment. Adding a
  database (Redis, SQLite, etc.) would let games survive server restarts.
- Feel free to adjust `words.js`, the color counts in `server.js`
  (`buildBoard`), timers, or the visual theme in `style.css` to make it
  your own.

Have fun!
