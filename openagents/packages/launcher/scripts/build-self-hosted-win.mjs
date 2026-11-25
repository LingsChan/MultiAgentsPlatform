import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, build, Platform } from 'electron-builder';

const require = createRequire(import.meta.url);
const launcher = fileURLToPath(new URL('../', import.meta.url));
const electronVersion = require('electron/package.json').version;
const { version } = require('../self-hosted/package.json');

await build({
  projectDir: resolve(launcher, 'self-hosted'),
  targets: Platform.WINDOWS.createTarget('dir', Arch.x64),
  publish: 'never',
  config: {
    appId: 'com.multiagentsplatform.desktop',
    electronVersion,
    electronDist: dirname(require('electron')),
    directories: { output: resolve(launcher, 'dist', 'self-hosted', version) },
    npmRebuild: false,
    win: { icon: resolve(launcher, 'self-hosted', 'icon.ico'), signExecutable: false },
  },
});
