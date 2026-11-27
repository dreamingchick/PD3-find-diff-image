import {test,expect} from '@playwright/test';
import {answers} from '../packages/game-engine/index.mjs';
async function start(page:import('@playwright/test').Page){await expect(page.getByRole('button',{name:/^스테이지 1 ·/})).toBeEnabled();await page.getByRole('button',{name:/^스테이지 1 ·/}).click();await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled()}

test('lobby to completion, records and portable backup',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('canvas')).toHaveCount(0);await start(page);
 for(const [i,a] of answers.entries()){
  const box=(await page.locator('canvas').nth(i%2).boundingBox())!;
  await page.mouse.click(box.x+box.width*a.x,box.y+box.height*a.y);
  await expect(page.getByRole('progressbar',{name:'찾은 정답'})).toHaveAttribute('aria-valuenow',String(i+1));
 }
 await expect(page.getByRole('region',{name:'클리어 결과'})).toBeVisible();
 await page.getByRole('button',{name:'메인으로',exact:true}).click();
 await expect(page.getByLabel('누적 별 3 / 3',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'완료 (1)',exact:true}).click();await expect(page.getByRole('button',{name:/^스테이지 1 ·/})).toBeVisible();
 await page.getByRole('button',{name:'내 기록',exact:true}).click();await expect(page.getByRole('heading',{name:'나의 발견 기록'})).toBeVisible();
 await page.getByRole('button',{name:'설정',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'백업 다운로드'}).click();const download=await downloadPromise;
 const stream=(await download.createReadStream())!;const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
 await page.getByLabel('백업 복원').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.getByText('유효한 PD3 백업 파일이 아닙니다.',{exact:false})).toBeVisible();
 await expect(page.getByLabel('누적 별 3 / 3',{exact:true})).toBeVisible();
 await page.getByLabel('백업 복원').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:bytes});
 await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'메인',exact:true}).click();await page.getByRole('button',{name:'도전',exact:true}).click();await start(page);
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');expect(errors).toEqual([]);
});

test('keyboard play, home and browser reload preserve normal progress',async({page})=>{
 await page.goto('/');await start(page);const canvas=page.locator('canvas').first();await canvas.focus();
 for(let i=0;i<9;i++)await canvas.press('ArrowUp');await canvas.press('Enter');
 await expect(page.getByText('정답!',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'메인으로 돌아가기',exact:true}).click();
 await expect(page.getByRole('button',{name:'이어서 찾기',exact:false})).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pd3-progress',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{return await new Promise<number>(resolve=>{const r=db.transaction('state').objectStore('state').get('progress');r.onsuccess=()=>resolve(r.result?.sessions['sample-001']?.found.length??0)})}finally{db.close()}
 })).toBe(1);
 await page.reload();await page.getByRole('button',{name:'이어서 찾기',exact:false}).click();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.goBack();await expect(page.getByRole('heading',{name:'어떤 그림을 만나볼까요?'})).toBeVisible();
});

test('both pictures and controls fit viewport; only explicit explore captures drag',async({page})=>{
 await page.goto('/');const viewport=page.viewportSize()!;
 if(viewport.width===320){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:260}]});
  for(let y=240;y>=80;y-=20)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(20);await cdp.detach();
 }
 await start(page);
 async function fit(){
  for(const canvas of await page.locator('canvas').all()){
   const box=(await canvas.boundingBox())!;expect(box.width).toBeGreaterThan(80);expect(Math.abs(box.width-box.height)).toBeLessThan(1);
   expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.y).toBeGreaterThanOrEqual(-1);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
  }
  for(const name of ['메인으로 돌아가기','힌트 1']){const box=(await page.getByRole('button',{name,exact:true}).boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1)}
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await fit();expect(await page.locator('canvas').first().evaluate(e=>getComputedStyle(e).touchAction)).toContain('pan-y');
 const a=(await page.locator('canvas').first().boundingBox())!,b=(await page.locator('canvas').nth(1).boundingBox())!;
 if(viewport.height>viewport.width)expect(b.y).toBeGreaterThanOrEqual(a.y+a.height);else expect(b.x).toBeGreaterThanOrEqual(a.x+a.width);
 await page.getByRole('button',{name:'확대·이동',exact:true}).click();await fit();
 await page.getByRole('button',{name:'확대',exact:true}).click();await expect(page.getByLabel('배율',{exact:true})).toHaveText('125%');
 expect(await page.locator('canvas').first().evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
 const canvas=page.locator('canvas').first(),box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3,{steps:8});await page.mouse.up();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 await page.getByRole('button',{name:'찾기로 전환',exact:true}).click();await fit();
 await page.getByRole('button',{name:'플레이 메뉴',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'계속 찾기',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'메인으로 돌아가기',exact:true}).click();await expect(page.locator('canvas')).toHaveCount(0);
});
