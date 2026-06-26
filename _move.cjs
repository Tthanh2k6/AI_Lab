const { app, BrowserWindow } = require('electron');
const path = require('path');
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function sample(win) {
  return JSON.parse(await win.webContents.executeJavaScript(`(() => {
    const w = window.__soccerWorld; if (!w) return 'null';
    const r = (n) => Math.round(n*10)/10;
    return JSON.stringify({
      t: w.tick, gen: w.generation,
      o: [r(w.orange.x), r(w.orange.y)],
      b: [r(w.blue.x), r(w.blue.y)],
      ball: [r(w.ball.x), r(w.ball.y), r(w.ball.z)],
      sc: [w.scoreOrange, w.scoreBlue],
    });
  })()`));
}

async function run() {
  const win = new BrowserWindow({ width: 1420, height: 920, show: true, webPreferences: { contextIsolation: true } });
  await win.loadFile(path.join(__dirname, 'dist/index.html'));
  await delay(1200);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.game-card')].find(e=>e.textContent.includes('BÓNG ĐÁ')).click()`);
  await delay(900);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('KHỞI CHẠY BÓNG ĐÁ')).click()`);
  await delay(800);
  // set tốc độ 8x cho nhanh
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='8×'); if(b)b.click();})()`);

  for (let i = 0; i < 6; i++) {
    await delay(700);
    console.log('SAMP', i, JSON.stringify(await sample(win)));
  }
  const fs = require('fs');
  const img = await win.webContents.capturePage();
  fs.writeFileSync(process.argv[2], img.toPNG());
  console.log('SAVED');
  await delay(200);
  app.quit();
}
app.whenReady().then(run).catch(e => { console.error('ERR', e); app.quit(); });
