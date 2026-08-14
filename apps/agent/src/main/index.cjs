/**
 * lo-agent 主进程入口
 *
 * 开发模式（ELECTRON_RENDERER_URL 存在时）加载 Vite dev server；
 * 生产模式加载构建产物 dist/index.html。
 */
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const { LoCoreService } = require('./lo-core.cjs');
const { ConfigStore } = require('./config-store.cjs');
const { registerLoCoreIpc } = require('./ipc.cjs');
const { PluginManager } = require('./plugin/plugin-manager.cjs');
const { ExtensionRegistry } = require('./plugin/extension-registry.cjs');
const { PluginStore } = require('./plugin/plugin-store.cjs');
const { registerPluginIpc } = require('./plugin/plugin-ipc.cjs');

const RENDERER_URL = process.env.ELECTRON_RENDERER_URL;

let loCoreService = null;
let mainWindow = null;
let pluginManager = null;

// 移除 Electron 默认应用菜单(File/Edit/View/Window/Help)
Menu.setApplicationMenu(null);

function initLoCore() {
  const store = new ConfigStore(app.getPath('userData'));
  loCoreService = new LoCoreService({
    loadConfig: () => store.load(),
    saveConfig: (config) => store.save(config),
  });
  registerLoCoreIpc(ipcMain, loCoreService);
}

function initPlugins() {
  const extensionRegistry = new ExtensionRegistry();
  pluginManager = new PluginManager({
    pluginsDir: path.join(app.getPath('userData'), 'plugins'),
    hostRequireBase: __dirname,
    loCore: loCoreService,
    extensionRegistry,
    pluginStore: new PluginStore(app.getPath('userData')),
    logger: console,
  });
  pluginManager.extensionRegistry = extensionRegistry;
  // 插件能力白名单 IPC（命令列表/执行），不透传实例
  registerPluginIpc(ipcMain, pluginManager);
}

function registerWindowControls() {
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.on('maximize', () => mainWindow && mainWindow.webContents.send('window:maximized-change', true));
  win.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-change', false));

  if (RENDERER_URL) {
    win.loadURL(RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  // 外部链接交给系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(async () => {
  initLoCore();
  registerWindowControls();
  createWindow();

  // 初始化插件系统：发现 → 加载 → 激活
  initPlugins();
  try {
    await pluginManager.initialize();
    await pluginManager.activateAll();
  } catch (e) {
    console.error(`[plugin] 插件系统初始化失败: ${e.message}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
