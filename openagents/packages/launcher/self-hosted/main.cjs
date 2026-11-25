const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('node:path');

const DEFAULT_WORKSPACE = 'http://localhost:3000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function readWorkspaceUrl() {
  const configured = app.commandLine.getSwitchValue('workspace-url')
    || process.env.MULTIAGENTS_WORKSPACE_URL || DEFAULT_WORKSPACE;
  const url = new URL(configured);
  const secure = url.protocol === 'https:'
    || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!secure || url.username || url.password) {
    throw new Error('请输入 HTTPS 工作区地址。本机工作区也可使用 HTTP。');
  }
  return url;
}

function openWorkspace(workspace) {
  const window = new BrowserWindow({
    title: 'MultiAgentsPlatform',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#080a0e',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#171819', symbolColor: '#e6dfd6', height: 34 },
    autoHideMenuBar: true,
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 560,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.on('page-title-updated', (event) => event.preventDefault());

  const isWorkspaceNavigation = (target) => {
    const url = URL.parse(target);
    return url?.protocol === workspace.protocol && url.origin === workspace.origin;
  };
  const restrictNavigation = (event, url) => {
    if (!isWorkspaceNavigation(url)) event.preventDefault();
  };
  window.webContents.on('will-navigate', restrictNavigation);
  window.webContents.on('will-redirect', restrictNavigation);
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWorkspaceNavigation(url)) void navigate(url);
    return { action: 'deny' };
  });

  async function navigate(url) {
    try {
      await window.loadURL(url);
    } catch (error) {
      if (window.isDestroyed() || error.code === 'ERR_ABORTED') return;
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        title: '连接工作区',
        message: '无法连接工作区',
        detail: workspace.origin,
        buttons: ['重试', '关闭'],
        cancelId: 1,
      });
      if (window.isDestroyed()) return;
      if (response === 0) void navigate(url);
      else window.close();
    }
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '工作区',
      submenu: [
        { label: '返回首页', click: () => void navigate(workspace.origin) },
        { role: 'reload', label: '刷新' },
        { role: 'close', label: '关闭' },
      ],
    },
    { role: 'editMenu', label: '编辑' },
  ]));
  void navigate(workspace.href);
}

app.whenReady().then(() => {
  let url;
  try {
    url = readWorkspaceUrl();
  } catch {
    dialog.showErrorBox('MultiAgentsPlatform', '工作区地址无效。请输入 HTTPS 地址或本机 HTTP 地址。');
    app.quit();
    return;
  }
  openWorkspace(url);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWorkspace(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
