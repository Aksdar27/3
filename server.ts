import './src/server/loadEnv.js';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { loadSettings, loadEngineState, saveEngineState, addLog, globalState } from './src/server/state.js';
import { initFirebase, startFirebaseHeartbeat } from './src/server/db.js';
import { initTwelveDataWs } from './src/server/websocket.js';
import { sendTelegramAlert } from './src/server/telegram.js';
import { apiRouter } from './src/server/api.js';

const app = express();
app.use(express.json());

const PORT = 3000;

app.use('/api', apiRouter);

async function startServer() {
  await loadSettings();
  await loadEngineState();
  initFirebase();
  initTwelveDataWs();
  startFirebaseHeartbeat();
  
  // Persist engine state periodically every 5 mins
  setInterval(() => {
      saveEngineState();
  }, 5 * 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    addLog(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

process.on('uncaughtException', async (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);
    addLog(`System Error (Uncaught): ${error.message}`, 'error');
    if (globalState.settings.telegramBotToken) {
        await sendTelegramAlert(`Critical Server Crash!\n\nError: ${error.message}\nHost runtime (e.g. Railway) might be forcing a restart or out of memory.`);
    }
    await saveEngineState();
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', async (reason: any, promise) => {
    console.error("UNHANDLED REJECTION:", reason);
    addLog(`System Error (Promise): ${reason?.message || reason}`, 'error');
});

