const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const WORDS = require("./words");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// In-memory game state. Keyed by 4-letter room code.
// ---------------------------------------------------------------------------
const rooms = {};

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms[code]);
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildBoard(startingTeam) {
  const chosenWords = shuffle(WORDS).slice(0, 25);
  const counts = {
    [startingTeam]: 9,
    [startingTeam === "red" ? "blue" : "red"]: 8,
    neutral: 7,
    assassin: 1,
  };
  let colors = [];
  Object.entries(counts).forEach(([color, count]) => {
    for (let i = 0; i < count; i++) colors.push(color);
  });
  colors = shuffle(colors);

  return chosenWords.map((word, i) => ({
    word,
    color: colors[i], // "red" | "blue" | "neutral" | "assassin"
    revealed: false,
  }));
}

function newGameState(roomCode, started) {
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  return {
    code: roomCode,
    board: buildBoard(startingTeam),
    startingTeam,
    turn: startingTeam,
    phase: "clue", // "clue" | "guess" | "over"
    clue: null, // { word, number, guessesUsed }
    winner: null,
    log: [],
    createdAt: Date.now(),
    started: !!started,
  };
}

function newRoom(roomCode, hostSocketId) {
  rooms[roomCode] = {
    code: roomCode,
    players: {}, // socketId -> { id, name, team, role }
    game: newGameState(roomCode),
    hostSocketId,
  };
  return rooms[roomCode];
}

function remainingCount(room, team) {
  return room.game.board.filter((c) => c.color === team && !c.revealed).length;
}

function addLog(room, text) {
  room.game.log.push({ text, at: Date.now() });
  if (room.game.log.length > 200) room.game.log.shift();
}

// Build the view of a room sent to a given socket: spymasters see all colors,
// operatives only see colors that have been revealed.
function viewForSocket(room, socketId) {
  const player = room.players[socketId];
  const isSpymaster = player && player.role === "spymaster";
  const board = room.game.board.map((cell) => ({
    word: cell.word,
    revealed: cell.revealed,
    color: cell.revealed || isSpymaster || room.game.phase === "over" ? cell.color : null,
  }));

  return {
    code: room.code,
    you: player || null,
    players: Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      role: p.role,
    })),
    board,
    turn: room.game.turn,
    phase: room.game.phase,
    started: room.game.started,
    clue: room.game.clue,
    winner: room.game.winner,
    remaining: {
      red: remainingCount(room, "red"),
      blue: remainingCount(room, "blue"),
    },
    log: room.game.log.slice(-50),
  };
}

function broadcastRoom(room) {
  for (const socketId of Object.keys(room.players)) {
    io.to(socketId).emit("state", viewForSocket(room, socketId));
  }
}

function playersOnTeam(room, team, role) {
  return Object.values(room.players).filter((p) => p.team === team && p.role === role);
}

function checkWinByCoverage(room) {
  if (remainingCount(room, "red") === 0) {
    room.game.phase = "over";
    room.game.winner = "red";
    addLog(room, "Red has found all their agents. Red wins!");
  } else if (remainingCount(room, "blue") === 0) {
    room.game.phase = "over";
    room.game.winner = "blue";
    addLog(room, "Blue has found all their agents. Blue wins!");
  }
}

function endTurn(room) {
  room.game.turn = room.game.turn === "red" ? "blue" : "red";
  room.game.phase = "clue";
  room.game.clue = null;
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name }, cb) => {
    const code = makeRoomCode();
    const room = newRoom(code, socket.id);
    room.players[socket.id] = { id: socket.id, name: name || "Player", team: null, role: null };
    socket.join(code);
    socket.data.room = code;
    addLog(room, `${room.players[socket.id].name} created the room.`);
    cb && cb({ ok: true, code });
    broadcastRoom(room);
  });

  socket.on("join_room", ({ name, code }, cb) => {
    const room = rooms[(code || "").toUpperCase()];
    if (!room) {
      cb && cb({ ok: false, error: "That room code doesn't exist." });
      return;
    }
    room.players[socket.id] = { id: socket.id, name: name || "Player", team: null, role: null };
    socket.join(room.code);
    socket.data.room = room.code;
    addLog(room, `${room.players[socket.id].name} joined the room.`);
    cb && cb({ ok: true, code: room.code });
    broadcastRoom(room);
  });

  socket.on("set_team", ({ team, role }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;

    if (team && !["red", "blue"].includes(team)) return;
    if (role && !["spymaster", "operative"].includes(role)) return;

    // Only one spymaster per team.
    if (role === "spymaster" && team) {
      const existing = playersOnTeam(room, team, "spymaster").find((p) => p.id !== socket.id);
      if (existing) {
        io.to(socket.id).emit("errorMsg", `${team} already has a spymaster.`);
        return;
      }
    }

    player.team = team ?? player.team;
    player.role = role ?? player.role;
    broadcastRoom(room);
  });

  socket.on("start_game", () => {
    const room = rooms[socket.data.room];
    if (!room) return;

    const redSpy = playersOnTeam(room, "red", "spymaster").length;
    const blueSpy = playersOnTeam(room, "blue", "spymaster").length;
    const redOps = playersOnTeam(room, "red", "operative").length;
    const blueOps = playersOnTeam(room, "blue", "operative").length;

    if (redSpy < 1 || blueSpy < 1 || redOps < 1 || blueOps < 1) {
      io.to(socket.id).emit(
        "errorMsg",
        "Each team needs at least one spymaster and one operative before you can start."
      );
      return;
    }

    room.game = newGameState(room.code, true);
    addLog(room, "New game started. Good luck, agents.");
    broadcastRoom(room);
  });

  socket.on("give_clue", ({ word, number }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || player.role !== "spymaster" || player.team !== room.game.turn) return;
    if (room.game.phase !== "clue") return;

    const n = Math.max(0, Math.min(25, parseInt(number, 10) || 0));
    const cleanWord = (word || "").trim();
    if (!cleanWord) return;

    room.game.clue = { word: cleanWord.toUpperCase(), number: n, guessesUsed: 0 };
    room.game.phase = "guess";
    addLog(room, `${player.name} (${player.team} spymaster) gives the clue: "${room.game.clue.word}" — ${n}`);
    broadcastRoom(room);
  });

  socket.on("guess", ({ index }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || player.role !== "operative" || player.team !== room.game.turn) return;
    if (room.game.phase !== "guess") return;

    const cell = room.game.board[index];
    if (!cell || cell.revealed) return;

    cell.revealed = true;
    room.game.clue.guessesUsed += 1;
    addLog(room, `${player.name} (${player.team}) reveals "${cell.word}" — it's ${cell.color}.`);

    if (cell.color === "assassin") {
      room.game.phase = "over";
      room.game.winner = player.team === "red" ? "blue" : "red";
      addLog(room, `That was the assassin! ${room.game.winner} wins!`);
      broadcastRoom(room);
      return;
    }

    checkWinByCoverage(room);
    if (room.game.phase === "over") {
      broadcastRoom(room);
      return;
    }

    const guessedOwnColor = cell.color === player.team;
    const outOfGuesses = room.game.clue.guessesUsed >= room.game.clue.number + 1; // +1 bonus guess

    if (!guessedOwnColor) {
      // Wrong team's color or neutral: turn ends immediately.
      endTurn(room);
    } else if (outOfGuesses) {
      endTurn(room);
    }

    broadcastRoom(room);
  });

  socket.on("end_turn", () => {
    const room = rooms[socket.data.room];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || player.team !== room.game.turn || room.game.phase !== "guess") return;
    addLog(room, `${player.name} ends the turn.`);
    endTurn(room);
    broadcastRoom(room);
  });

  socket.on("new_game", () => {
    const room = rooms[socket.data.room];
    if (!room) return;
    room.game = newGameState(room.code, true);
    addLog(room, "A new game has been started with the same players.");
    broadcastRoom(room);
  });

  socket.on("send_chat", ({ text }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !text) return;
    addLog(room, `${player.name}: ${text.slice(0, 300)}`);
    broadcastRoom(room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    if (player) {
      addLog(room, `${player.name} left the room.`);
      delete room.players[socket.id];
    }
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomCode];
    } else {
      broadcastRoom(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Codenames clone running at http://localhost:${PORT}`);
});
