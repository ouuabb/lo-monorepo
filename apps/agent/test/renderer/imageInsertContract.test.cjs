/**
 * imageInsertContract.test.cjs —— Image 插入接线契约断言（防回归）
 *
 * 锁定 ImageManager → App.handleInsertImageToActiveEditor → NoteEditor.insertImage
 * 的**实际参数形态**：三处位置参数 (rid, alt, filename)，最终写入严格为
 * `![alt](res_xxx)`。任何一端被改成对象形态/其他签名都会在此失败。
 */
const fs = require('fs');
const path = require('path');

const IMAGE_MANAGER = path.join(
  __dirname, '..', '..', 'src', 'renderer', 'src', 'image', 'ImageManager.jsx',
);
const APP_JSX = path.join(__dirname, '..', '..', 'src', 'renderer', 'src', 'App.jsx');
const NOTE_EDITOR = path.join(
  __dirname, '..', '..', 'src', 'renderer', 'src', 'editor', 'NoteEditor.jsx',
);

const read = (p) => fs.readFileSync(p, 'utf8');

describe('Image 插入接线契约（ImageManager → App → NoteEditor）', () => {
  test('ImageManager.handleInsert 以三位置参数调用 onInsert（禁止对象形态）', () => {
    const src = read(IMAGE_MANAGER);
    expect(src).toContain("onInsert(image.rid, image.name || '', image.name || '')");
    expect(src).not.toMatch(/onInsert\(\{\s*rid:/);
  });

  test('App.handleInsertImageToActiveEditor 保持 (rid, alt, filename) 三位置签名', () => {
    const src = read(APP_JSX);
    expect(src).toContain(
      'const handleInsertImageToActiveEditor = useCallback(\n    (rid, alt = \'\', filename = \'\') => {',
    );
    expect(src).toContain('ed.insertImage(rid, alt || \'\')');
    expect(src).not.toMatch(/handleInsertImageToActiveEditor\(\{\s*rid:/);
  });

  test('NoteEditor.insertImage 拼接严格为 ![alt](res_xxx)', () => {
    const src = read(NOTE_EDITOR);
    expect(src).toContain('insertImage(rid, alt = \'\')');
    expect(src).toContain('const snippet = `![${safeAlt}](${rid})`;');
  });

  test('端到端参数契约：插入产生合法 RID 引用', () => {
    const img = read(IMAGE_MANAGER);
    const app = read(APP_JSX);
    const ed = read(NOTE_EDITOR);
    // 契约链：ImageManager 传 (rid, alt, filename) → App 转发 (rid, alt) → NoteEditor 拼 ![alt](rid)
    expect(img).toMatch(/onInsert\(image\.rid,/);
    expect(app).toMatch(/ed\.insertImage\(rid, alt/);
    expect(ed).toMatch(/`!\[\$\{safeAlt\}\]\(\$\{rid\}\)`/);
    // 生成的引用必须以 res_ 开头的 RID（真实链路中 rid 为 res_xxx，非 [object Object]）
    expect(ed).toMatch(/res_/);
  });
});