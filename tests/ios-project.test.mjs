import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('the iOS project has unique object IDs so Xcode can resolve its build graph',async () => {
  const project=await readFile(new URL('../ios/App/App.xcodeproj/project.pbxproj',import.meta.url),'utf8');
  const definitions=[...project.matchAll(/^\s*([A-F0-9]{24})(?:\s*\/\*[^\n]*?\*\/)?\s*=\s*\{\s*isa\s*=/gm)];
  assert.ok(definitions.length>0,'The Xcode project must define its build objects.');
  const seen=new Set();
  for (const [,id] of definitions) {
    assert.ok(!seen.has(id),`Duplicate Xcode object ID ${id} makes the build graph ambiguous.`);
    seen.add(id);
  }
});
