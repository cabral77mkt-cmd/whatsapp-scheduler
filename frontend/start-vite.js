#!/usr/bin/env node
// Wrapper para converter --root <path> em argumento posicional para o Vite
// (Esta versão do Vite aceita: vite [root], não vite --root <path>)
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const newArgs = [];
let root = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) {
    root = args[++i];
  } else {
    newArgs.push(args[i]);
  }
}

// Coloca root como primeiro argumento posicional
if (root) newArgs.unshift(root);

const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, ...newArgs], {
  stdio: 'inherit',
  cwd: __dirname,
});
child.on('exit', (code) => process.exit(code ?? 0));
