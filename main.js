const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const DATA_FILE = path.join(app.getPath('userData'), 'data.json');
const HOTKEY = 'Control+Shift+H';

function defaultData() {
  return {
    habits: {
      kalyan: { name: 'Кальян', startDate: new Date().toISOString(), relapses: [], costPerDay: 0 },
      kazik: { name: 'Казик', startDate: new Date().toISOString(), relapses: [], costPerDay: 0 }
    },
    activities: {
      treadmill: { name: 'Бігова доріжка', sessions: [] }
    },
    expenses: {
      delivery: { name: 'Доставка їжі', entries: [] }
    },
    calories: {},
    profile: {
      sex: 'male', age: null, heightCm: null, weightKg: null,
      goalWeightKg: null, activityLevel: 1.2, deficit: 500
    },
    settings: { geminiApiKey: '', autoLaunch: true, currency: '₴' }
  };
}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch {
    const d = defaultData();
    saveData(d);
    return d;
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

let win = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: 380,
    height: 620,
    x: workArea.x + workArea.width - 400,
    y: workArea.y + 20,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
  tray.setToolTip('Habit Widget');
  const menu = Menu.buildFromTemplate([
    { label: 'Показати / Сховати', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Вийти', click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    globalShortcut.register(HOTKEY, toggleWindow);

    const data = loadData();
    app.setLoginItemSettings({
      openAtLogin: !!data.settings.autoLaunch,
      path: process.execPath
    });
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

// ---- IPC ----
ipcMain.handle('data:get', () => loadData());

ipcMain.handle('data:save', (e, data) => {
  saveData(data);
  return true;
});

ipcMain.handle('data:openFolder', () => {
  shell.openPath(path.dirname(DATA_FILE));
});

ipcMain.handle('data:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Експорт даних',
    defaultPath: `habit-widget-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(loadData(), null, 2), 'utf-8');
  return true;
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Імпорт даних',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  const raw = fs.readFileSync(filePaths[0], 'utf-8');
  const parsed = JSON.parse(raw);
  const merged = { ...defaultData(), ...parsed };
  saveData(merged);
  return merged;
});

ipcMain.handle('window:hide', () => win && win.hide());
ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('app:setAutoLaunch', (e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
});

function geminiRequest(apiKey, model, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(chunks);
          if (json.error) return reject(new Error(json.error.message || 'Gemini API error'));
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractText(json) {
  return json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Gemini response');
  return JSON.parse(match[0]);
}

ipcMain.handle('gemini:analyzeMeal', async (e, { apiKey, text }) => {
  if (!apiKey) throw new Error('Немає Gemini API ключа');
  const prompt = `Ти нутриціолог-аналізатор їжі. Проаналізуй опис прийому їжі нижче і поверни ЛИШЕ JSON без пояснень, без markdown, у форматі:
{"kcal": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "junk": boolean}
Де junk=true якщо це фастфуд/солодке/алкоголь/сильно оброблена їжа, інакше false. Округли числа до цілих.

Опис їжі:
${text}`;
  const json = await geminiRequest(apiKey, 'gemini-2.0-flash', {
    contents: [{ parts: [{ text: prompt }] }]
  });
  return extractJson(extractText(json));
});

ipcMain.handle('gemini:recommendation', async (e, { apiKey, context }) => {
  if (!apiKey) throw new Error('Немає Gemini API ключа');
  const prompt = `Ти лаконічний фітнес-асистент. На основі даних дай коротку (1-2 речення) рекомендацію українською щодо їжі на залишок дня.
Дані: ${JSON.stringify(context)}
Відповідай ЛИШЕ текстом рекомендації, без вступів.`;
  const json = await geminiRequest(apiKey, 'gemini-2.0-flash', {
    contents: [{ parts: [{ text: prompt }] }]
  });
  return extractText(json).trim();
});
