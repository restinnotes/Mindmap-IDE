import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs/promises'
import * as path from 'path'
import OpenAI from 'openai' 
require('dotenv').config() 

const MIMO_API_BASE = "https://api.xiaomimimo.com/v1";
const MODEL_NAME = "mimo-v2-flash";

// 读取 MIMO_API_KEY
const API_KEYS = (process.env.MIMO_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
let currentKeyIndex = 0;

function getNextKey() {
  if (API_KEYS.length === 0) return null;
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function sendProgress(percent: number) {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ai:progress', { percent }));
}

async function robustRequest(messages: any[]) {
  let attempts = 0;
  const maxTotalAttempts = Math.max(API_KEYS.length, 1) * 2; 

  while (attempts < maxTotalAttempts) {
    const key = getNextKey();
    if (!key) throw new Error("No API Keys found in .env (MIMO_API_KEY)");

    try {
      const client = new OpenAI({ apiKey: key, baseURL: MIMO_API_BASE });
      return await client.chat.completions.create({
        model: MODEL_NAME,
        messages: messages,
        temperature: 0.1,
      });
    } catch (e: any) {
      attempts++;
      console.error(`[API Fail] Attempt ${attempts} | Status: ${e.status} | Error: ${e.message}`);
      await sleep(1000);
    }
  }
  throw new Error(`All ${maxTotalAttempts} attempts failed.`);
}

function classifyFile(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.includes('main')) return 'Main Process';
  if (p.includes('renderer')) return 'Renderer Process';
  if (p.includes('preload')) return 'Preload Script';
  if (p.includes('node') || p.includes('config')) return 'Config/System';
  return 'Logic Module';
}

async function getFiles(dir: string): Promise<string[]> {
  let results: string[] = [];
  try {
    const list = await fs.readdir(dir);
    for (const f of list) {
      if (['node_modules', '.git', 'dist', 'out', 'build'].includes(f)) continue;
      const p = path.join(dir, f);
      if ((await fs.stat(p)).isDirectory()) results = results.concat(await getFiles(p));
      else if (['.ts', '.tsx', '.js', '.jsx', '.json'].includes(path.extname(f).toLowerCase())) results.push(p);
    }
  } catch (e) {} return results;
}

async function buildTree(dir: string): Promise<any> {
  const stats = await fs.stat(dir);
  if (!stats.isDirectory()) return { id: dir, name: path.basename(dir), type: 'file' };
  const list = await fs.readdir(dir);
  const children = (await Promise.all(list.map(f => 
    !['node_modules', '.git', 'dist', 'out'].includes(f) && !f.startsWith('.') ? buildTree(path.join(dir, f)) : null
  ))).filter(Boolean);
  return { id: dir, name: path.basename(dir), type: 'folder', children };
}

function setupIpcHandlers() {
  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return canceled ? null : await buildTree(filePaths[0]);
  });

  ipcMain.handle('ai:summarizeFolder', async (_, folderPath: string) => {
    const allFiles = await getFiles(folderPath);
    const results: any[] = [];
    
    console.log(`\n=== [LOGIC HORIZON] STARTING ANALYSIS ===`);
    console.log(`Total Files: ${allFiles.length} | Mode: Stable Serial`);

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      const fileName = path.relative(folderPath, filePath);
      const category = classifyFile(fileName);
      console.log(`[${i+1}/${allFiles.length}] Analyzing: ${fileName} (${category})`);

      try {
        const code = await fs.readFile(filePath, 'utf-8');
        const res = await robustRequest([
          { role: "system", content: "Summarize this code file's role in 1 sentence." },
          { role: "user", content: `Category: ${category}\nFile: ${fileName}\nCode:\n${code.substring(0, 6000)}` }
        ]);
        results.push({ path: fileName, category, summary: res.choices[0].message.content });
      } catch (err) { console.error(`[Error] Skipping ${fileName}`); }

      sendProgress(Math.round(((i + 1) / allFiles.length) * 100));
      await sleep(600); 
    }

    const finalRes = await robustRequest([
      { 
        role: "system", 
        content: `You are an architect. Output a JSON (NO Markdown):
        {
          "story": "用中文详细描述项目各部分的职责和协作逻辑。",
          "mermaid": "graph TD\\nsubgraph Main\\n...\\nend"
        }` 
      },
      { role: "user", content: `Data:\n${JSON.stringify(results).substring(0, 50000)}` }
    ]);

    const cleanJson = finalRes.choices[0].message.content!.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  });
}

app.whenReady().then(() => { setupIpcHandlers(); createWindow(); });
function createWindow() {
  const win = new BrowserWindow({ width: 1500, height: 900, autoHideMenuBar: true, webPreferences: { preload: join(__dirname, '../preload/index.js') } });
  if (is.dev) win.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}