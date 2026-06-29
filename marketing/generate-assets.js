const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(__dirname, 'screenshots');
fs.mkdirSync(outDir, {recursive: true});

const logoPath = path.join(root, 'img', 'logo.png');
const logoData = fs.readFileSync(logoPath).toString('base64');
const logoHref = `data:image/png;base64,${logoData}`;

const font = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(x, y, content, size, fill = '#19324d', weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${esc(content)}</text>`;
}

function multiline(x, y, lines, size, fill = '#416079', weight = 500, lineHeight = 1.45) {
  return lines.map((line, index) => text(x, y + index * size * lineHeight, line, size, fill, weight)).join('');
}

function roundRect(x, y, w, h, r, fill, stroke = 'none', sw = 1, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
}

function shadow(id, dx = 0, dy = 14, blur = 28, opacity = 0.18) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%">
    <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur / 2}" flood-color="#12304a" flood-opacity="${opacity}"/>
  </filter>`;
}

function defs() {
  return `<defs>
    ${shadow('soft')}
    ${shadow('card', 0, 8, 18, 0.15)}
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#eef7ff"/>
      <stop offset="0.55" stop-color="#f8fbff"/>
      <stop offset="1" stop-color="#eaf3f1"/>
    </linearGradient>
    <linearGradient id="blue" x1="0" x2="1">
      <stop offset="0" stop-color="#0b6ee8"/>
      <stop offset="1" stop-color="#14a7d7"/>
    </linearGradient>
    <linearGradient id="green" x1="0" x2="1">
      <stop offset="0" stop-color="#12a37f"/>
      <stop offset="1" stop-color="#5bc77a"/>
    </linearGradient>
    <linearGradient id="photo1" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#dae7ff"/>
      <stop offset="1" stop-color="#8fb9e9"/>
    </linearGradient>
    <linearGradient id="photo2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ffe8bf"/>
      <stop offset="1" stop-color="#e9a86c"/>
    </linearGradient>
    <linearGradient id="photo3" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#d6f6e9"/>
      <stop offset="1" stop-color="#6bbf9c"/>
    </linearGradient>
  </defs>`;
}

function browserFrame(x, y, w, h) {
  return `<g filter="url(#soft)">
    ${roundRect(x, y, w, h, 18, '#ffffff', '#c7d8e8', 2)}
    ${roundRect(x, y, w, 54, 18, '#f4f8fc')}
    <circle cx="${x + 28}" cy="${y + 27}" r="7" fill="#ff6b6b"/>
    <circle cx="${x + 51}" cy="${y + 27}" r="7" fill="#f6c34a"/>
    <circle cx="${x + 74}" cy="${y + 27}" r="7" fill="#35c772"/>
    ${roundRect(x + 112, y + 15, w - 152, 24, 12, '#ffffff', '#d4e2ef', 1)}
    ${text(x + 132, y + 33, 'photo.weibo.com / albums', 13, '#7890a7', 500)}
  </g>`;
}

function albumCard(x, y, title, count, grad, selected = false) {
  const badgeWidth = Math.max(48, String(count).length * 17 + 20);
  const badgeX = x + 158 - badgeWidth;
  return `<g filter="url(#card)">
    ${roundRect(x, y, 168, 150, 12, '#ffffff', selected ? '#0b6ee8' : '#cbdcec', selected ? 3 : 2)}
    ${roundRect(x + 10, y + 10, 148, 104, 10, `url(#${grad})`)}
    ${roundRect(badgeX, y + 18, badgeWidth, 38, 19, '#24394e', 'none', 1, 'opacity="0.88"')}
    ${text(badgeX + badgeWidth / 2, y + 46, count, 22, '#ffffff', 700, 'text-anchor="middle"')}
    ${roundRect(x + 20, y + 100, 112, 32, 8, '#263d55', 'none', 1, 'opacity="0.92"')}
    ${text(x + 30, y + 123, title, 20, '#ffffff', 700)}
  </g>`;
}

function popupMock(x, y, scale = 1) {
  const s = scale;
  const g = [];
  g.push(`<g transform="translate(${x},${y}) scale(${s})" filter="url(#soft)">`);
  g.push(roundRect(0, 0, 520, 620, 0, '#f7faff', '#c7d8e8', 2));
  g.push(text(34, 38, '当前用户：红豆原子牛奶糖 UID：144782...', 22, '#1265d6', 700));
  g.push(roundRect(30, 60, 460, 58, 12, '#ffffff', '#d6e4f2', 2));
  g.push(text(52, 97, '注意事项', 22, '#264764', 700));
  g.push(text(430, 97, '展开', 20, '#6d8398', 600));
  g.push(roundRect(30, 140, 460, 100, 12, '#ffffff', '#d6e4f2', 2));
  g.push(text(52, 177, '账号', 19, '#6a8298', 600));
  g.push(text(270, 177, '比例', 19, '#6a8298', 600));
  g.push(text(392, 177, '并发', 19, '#6a8298', 600));
  g.push(roundRect(52, 190, 195, 45, 8, '#ffffff', '#b8cee4', 2));
  g.push(text(66, 220, '红豆原子牛奶糖', 20, '#24425d', 500));
  g.push(roundRect(270, 190, 104, 45, 8, '#ffffff', '#b8cee4', 2));
  g.push(text(283, 220, '100%', 20, '#24425d', 500));
  g.push(roundRect(392, 190, 76, 45, 8, '#ffffff', '#b8cee4', 2));
  g.push(text(410, 220, '3', 20, '#24425d', 500));
  g.push(albumCard(30, 260, '头像相册', '62', 'photo1'));
  g.push(albumCard(204, 260, '微博配图', '6021', 'photo2', true));
  g.push(albumCard(378, 260, '默认专辑', '0', 'photo3'));
  g.push(roundRect(30, 435, 460, 150, 12, '#ffffff', '#d6e4f2', 2));
  g.push(text(52, 468, '下载进度', 22, '#24425d', 700));
  g.push(roundRect(120, 500, 220, 8, 4, '#d7e3ee'));
  g.push(roundRect(120, 500, 86, 8, 4, 'url(#blue)'));
  g.push(text(120, 492, '已保存 1000 / 6021 张，已抓取 1000 张', 17, '#5c7690', 600));
  g.push(text(120, 533, '正在保存第 2 包 ZIP · 已打包 2 / 13 包', 17, '#5c7690', 600));
  g.push(text(120, 565, '失败日志自动写入 ZIP', 17, '#1265d6', 700));
  g.push(roundRect(360, 504, 76, 42, 10, '#e24852'));
  g.push(text(380, 532, '暂停', 20, '#ffffff', 700));
  g.push('</g>');
  return g.join('');
}

function featurePill(x, y, icon, title, desc, color = 'url(#blue)') {
  return `<g filter="url(#card)">
    ${roundRect(x, y, 310, 118, 12, '#ffffff', '#d5e3ef', 1.5)}
    <circle cx="${x + 54}" cy="${y + 58}" r="30" fill="${color}"/>
    ${text(x + 42, y + 69, icon, 30, '#ffffff', 700)}
    ${text(x + 98, y + 48, title, 25, '#1e3d59', 800)}
    ${multiline(x + 98, y + 78, desc, 16, '#607891', 500, 1.35)}
  </g>`;
}

function screenOverview() {
  const w = 1280, h = 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs()}
    ${roundRect(0, 0, w, h, 0, 'url(#bg)')}
    ${browserFrame(70, 70, 1140, 660)}
    <image href="${logoHref}" x="116" y="126" width="92" height="92"/>
    ${text(230, 165, 'Octo 微博相册批量下载', 48, '#12324f', 900)}
    ${text(232, 212, '一键读取相册，批量保存微博配图、头像相册与专辑图片', 24, '#55718a', 500)}
    ${popupMock(118, 245, 0.72)}
    ${featurePill(560, 292, '↓', '批量下载', ['识别当前微博用户', '相册列表自动整理'], 'url(#blue)')}
    ${featurePill(560, 440, 'ZIP', '打包保存', ['按 500 张生成 ZIP', '失败日志随包保存'], 'url(#green)')}
    ${featurePill(900, 292, '↻', '可暂停恢复', ['队列状态实时显示', '关闭弹窗也可恢复'], '#5f7cf6')}
    ${featurePill(900, 440, '✓', '防盗链处理', ['后台校验图片内容', '避免保存成 HTML'], '#ef8b3d')}
  </svg>`;
}

function screenPackage() {
  const w = 1280, h = 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs()}
    ${roundRect(0, 0, w, h, 0, '#f4f9fd')}
    ${browserFrame(62, 54, 1156, 692)}
    ${text(116, 150, '打包下载更适合大相册', 46, '#153653', 900)}
    ${text(118, 196, '每包数量可配置，默认 500 张；ZIP 文件名使用当前用户昵称', 24, '#607b93', 500)}
    ${popupMock(790, 115, 0.82)}
    <g filter="url(#soft)">
      ${roundRect(118, 260, 555, 300, 18, '#ffffff', '#d2e2f0', 2)}
      ${text(158, 315, '下载/WeiboAlbum/用户名/', 30, '#153653', 800)}
      ${text(158, 365, '用户名_001.zip', 28, '#1265d6', 800)}
      ${text(158, 412, '用户名_002.zip', 28, '#1265d6', 800)}
      ${text(158, 459, 'download_failures.txt', 24, '#6b8297', 700)}
      ${roundRect(158, 500, 390, 12, 6, '#d9e6f0')}
      ${roundRect(158, 500, 310, 12, 6, 'url(#green)')}
      ${text(158, 548, '生成、保存、继续获取下一包，队列自动衔接', 22, '#607891', 600)}
    </g>
  </svg>`;
}

function screenReliable() {
  const w = 1280, h = 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs()}
    ${roundRect(0, 0, w, h, 0, 'url(#bg)')}
    ${text(92, 132, '为微博图床设计的稳定下载链路', 48, '#12324f', 900)}
    ${text(94, 182, '后台 fetch 校验图片内容，IndexedDB 暂存 Blob，offscreen 创建短链接保存', 24, '#607b93', 500)}
    <g filter="url(#soft)">
      ${roundRect(92, 250, 1096, 270, 18, '#ffffff', '#d5e3ef', 2)}
      ${featurePill(130, 300, '1', '识别相册', ['当前微博页面', '自动读取用户相册'], '#5f7cf6')}
      ${featurePill(485, 300, '2', '抓取原图', ['带微博 referrer', '拒绝 HTML/403 内容'], '#0b83d8')}
      ${featurePill(840, 300, '3', '保存 ZIP', ['大文件走 Blob URL', '失败项写日志'], '#11a47f')}
    </g>
    <g filter="url(#card)">
      ${roundRect(185, 585, 910, 92, 14, '#143555')}
      ${text(230, 642, '[fetch] image/jpeg · [zip] files: 500 · failures logged', 24, '#ffffff', 700)}
    </g>
  </svg>`;
}

function smallPromo() {
  const w = 440, h = 280;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs()}
    ${roundRect(0, 0, w, h, 0, 'url(#bg)')}
    <image href="${logoHref}" x="30" y="34" width="74" height="74"/>
    ${text(120, 66, '微博相册', 30, '#12324f', 900)}
    ${text(120, 102, '批量下载', 30, '#1265d6', 900)}
    ${roundRect(34, 145, 372, 78, 14, '#ffffff', '#d3e2ef', 2)}
    ${text(58, 178, '逐张保存 / ZIP 打包 / 失败日志', 19, '#24425d', 700)}
    ${text(58, 207, '适配 Manifest V3 的 Chrome 扩展', 15, '#6b8297', 600)}
  </svg>`;
}

function blogHero() {
  const w = 1400, h = 560;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${defs()}
    ${roundRect(0, 0, w, h, 0, '#eef7ff')}
    ${text(90, 130, 'Octo 微博相册批量下载', 58, '#12324f', 900)}
    ${text(94, 190, '批量保存微博相册图片，支持 ZIP 打包与失败日志', 28, '#5f778e', 500)}
    ${roundRect(94, 250, 210, 58, 14, 'url(#blue)')}
    ${text(132, 288, 'Chrome 扩展', 25, '#ffffff', 800)}
    ${roundRect(326, 250, 245, 58, 14, '#ffffff', '#cbddeb', 2)}
    ${text(360, 288, 'Manifest V3', 25, '#24425d', 800)}
    ${popupMock(850, 44, 0.76)}
    ${featurePill(94, 360, 'ZIP', '打包下载', ['按数量生成压缩包'], 'url(#green)')}
    ${featurePill(430, 360, '✓', '稳定保存', ['防盗链与内容校验'], '#5f7cf6')}
  </svg>`;
}

const assets = [
  ['chrome-store-01-overview-1280x800.png', screenOverview()],
  ['chrome-store-02-package-1280x800.png', screenPackage()],
  ['chrome-store-03-reliable-1280x800.png', screenReliable()],
  ['chrome-store-small-promo-440x280.png', smallPromo()],
  ['blog-hero-1400x560.png', blogHero()],
];

async function main() {
  for (const [filename, svg] of assets) {
    const output = path.join(outDir, filename);
    fs.writeFileSync(output.replace(/\.png$/, '.svg'), svg);
    await sharp(Buffer.from(svg)).png().toFile(output);
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
