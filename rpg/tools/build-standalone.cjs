/**
 * tools/build-standalone.js
 * @layer build(optional)
 * ES Modules + fetch(JSON) 構成を、サーバ不要で file:// 直開きできる
 * 単一HTML（dist/eternia-standalone.html）に束ねる任意ビルド。
 *   - src/**.js を「モジュールごとに関数で包む」方式でバンドル（名前衝突なし）
 *   - data/**.json を window.__DATA に全インライン化（fetch を不要に）
 *   - css/style.css をインライン化
 * 本体のソース構成（ビルド不要・ES Modules）は一切変更しない。
 * 使い方:  cd rpg && node tools/build-standalone.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // rpg/
const SRC = path.join(ROOT, 'src');
const ENTRY = 'src/main.js';

// ---- 1) データJSONをインライン化（key = data/ からの相対パス） ----
function walk(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, base, out);
    else if (name.endsWith('.json')) out[path.relative(base, fp).split(path.sep).join('/')] = JSON.parse(fs.readFileSync(fp, 'utf8'));
  }
}
const DATA = {};
walk(path.join(ROOT, 'data'), path.join(ROOT, 'data'), DATA);

// ---- 2) src の全モジュールを収集・変換 ----
function listJs(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) listJs(fp, out);
    else if (name.endsWith('.js')) out.push(fp);
  }
}
const files = [];
listJs(SRC, files);

const keyOf = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const resolveSpec = (fromKey, spec) => {
  const p = path.posix.normalize(path.posix.join(path.posix.dirname(fromKey), spec));
  return p;
};

let modules = '';
for (const abs of files) {
  const key = keyOf(abs);
  let body = fs.readFileSync(abs, 'utf8');

  // Database.js だけ：fetch の前に __DATA を見るよう差し込む
  if (key.endsWith('data/Database.js')) {
    body = body.replace('async function loadJson(path) {',
      'async function loadJson(path) { if (globalThis.__DATA && (path in globalThis.__DATA)) return globalThis.__DATA[path];');
  }

  // export を剥がして名前を収集
  const exported = [];
  body = body.replace(/^export\s+(class|function)\s+([A-Za-z0-9_$]+)/gm, (m, kind, name) => { exported.push(name); return `${kind} ${name}`; });
  body = body.replace(/^export\s+const\s+([A-Za-z0-9_$]+)/gm, (m, name) => { exported.push(name); return `const ${name}`; });

  // static import → const {..} = __req('key')（`as` は分割代入の `:` に変換）
  body = body.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?[^\n]*$/gm,
    (m, names, spec) => `const {${names.trim().replace(/\s+as\s+/g, ': ')}} = __req('${resolveSpec(key, spec)}');`);

  // dynamic import('spec') → __dynreq('key')
  body = body.replace(/import\(\s*['"]([^'"]+)['"]\s*\)/g, (m, spec) => `__dynreq('${resolveSpec(key, spec)}')`);

  // 末尾にエクスポート登録
  if (exported.length) body += `\n;Object.assign(__x, { ${exported.join(', ')} });`;

  modules += `__mods[${JSON.stringify(key)}] = function(__x){\n${body}\n};\n`;
}

// ---- 3) ランタイム（簡易モジュールシステム）＋エントリ ----
const runtime = `(function(){
var __mods={}, __cache={};
function __req(id){ if(__cache[id]) return __cache[id]; var x={}; __cache[id]=x; if(!__mods[id]) throw new Error('module not found: '+id); __mods[id](x); return x; }
function __dynreq(id){ try { return Promise.resolve(__req(id)); } catch(e){ return Promise.reject(e); } }
${modules}
__req(${JSON.stringify(ENTRY)});
})();`;

// ---- 4) CSS / HTML を組み立て ----
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link[^>]*href="css\/style\.css"[^>]*>/, `<style>\n${css}\n</style>`);
const dataScript = `window.__DATA = ${JSON.stringify(DATA)};`;
// </script> 混入対策
const payload = (dataScript + '\n' + runtime).replace(/<\//g, '<\\/');
html = html.replace(/<script[^>]*src="src\/main\.js"[^>]*><\/script>/, `<script>\n${payload}\n</script>`);

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eternia-standalone.html');
fs.writeFileSync(outFile, html);
console.log('built', path.relative(ROOT, outFile), '(' + (fs.statSync(outFile).size / 1024 | 0) + ' KB)', '| modules:', files.length, '| data:', Object.keys(DATA).length);
