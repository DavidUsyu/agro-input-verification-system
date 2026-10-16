import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
function run(command, args, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: quiet ? 'ignore' : 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command === process.execPath ? 'npm ' + args.slice(1).join(' ') : command + ' ' + args.join(' ')} did not complete successfully.`)));
  });
}
async function npm(script) { await run(process.execPath, [npmCli, 'run', script]); }
try {
  if (!npmCli) throw new Error('Start this script with npm run local (npm.cmd run local in PowerShell).');
  await npm('setup');
  try { await run('docker', ['info', '--format', '{{.ServerVersion}}'], true); }
  catch { console.log('Starting Docker Desktop…'); await run('docker', ['desktop', 'start']); }
  await npm('db:up');
  await npm('db:migrate');
  console.log('Starting AgroVerify. Open http://localhost:3000 after the website is ready. Keep this terminal running; Ctrl+C stops the application servers.');
  await npm('dev');
} catch (error) {
  console.error(error.message);
  console.error('Check that Docker Desktop is installed and the ports are free. You can also follow the individual startup steps in README.md.');
  process.exitCode = 1;
}
