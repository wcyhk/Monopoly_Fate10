import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApplication} from '../server.mjs';
import {LIBRARY_URL} from '../background-library.js';

const publicOrigin = 'https://wcy.hk';

test('background library requests go directly to the current portfolio domain', () => {
  const library = new URL(LIBRARY_URL);
  assert.equal(library.origin, publicOrigin);
  assert.equal(library.pathname, '/Monopoly_Fate10/theme-media/library.json');
});

test('admin and preview policies allow current media and manifest requests', async () => {
  const prefix = join(tmpdir(), 'monopoly-media-origin-');
  const dataDir = await mkdtemp(prefix);
  const app = await createApplication({dataDir, publicOrigin});
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  try {
    for (const path of ['/admin.html', '/theme-preview.html']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      const policy = response.headers.get('content-security-policy');
      const directives = new Map(policy.split(';').map(part => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name, sources];
      }));
      for (const name of ['media-src', 'connect-src']) {
        assert.ok(directives.get(name).includes(publicOrigin), path + ': ' + name);
        assert.ok(!directives.get(name).includes('*'), 'retain explicit source allowlists');
      }
      assert.ok(!policy.includes('yuenhk.github.io'));
      assert.deepEqual(directives.get('object-src'), ["'none'"]);
      if (path === '/theme-preview.html') {
        assert.deepEqual(directives.get('frame-ancestors'), ["'self'"]);
      } else {
        assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
        const html = await response.text();
        assert.ok(html.includes(publicOrigin + '/Monopoly_Fate10/theme-media/credits.html'));
      }
    }
  } finally {
    await app.close();
    assert.ok(dataDir.startsWith(prefix));
    await rm(dataDir, {recursive: true, force: true});
  }
});
