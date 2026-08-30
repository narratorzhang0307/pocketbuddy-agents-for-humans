import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'hardware/ojbadge-agent-link');
const build = mkdtempSync(join(tmpdir(), 'pocketbuddy-agent-link-'));
const compiler = process.env.CXX || 'c++';

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

try {
  const protocol = join(build, 'protocol-host-test');
  run(compiler, [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    join(source, 'tests/protocol_host_test.cpp'),
    join(source, 'components/agent_link/src/protocol.cpp'),
    '-o', protocol,
  ]);
  run(protocol, []);

  const voice = join(build, 'voice-pcm-buffer-test');
  run(compiler, [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    join(source, 'tests/voice_pcm_buffer_test.cpp'),
    '-o', voice,
  ]);
  run(voice, []);
  console.log('PASS: AgentLink host protocol and bounded audio-buffer verification');
} finally {
  rmSync(build, { recursive: true, force: true });
}
