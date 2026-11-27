import {test,expect} from '@playwright/test';
import {answers} from '../packages/game-engine/index.mjs';
test('clear, mode stars, backup and corrupt import preserve practice records',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 for(const [i,a] of answers.entries()){
  const canvas=page.locator('canvas').nth(i%2);await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;
  await page.mouse.click(box.x+box.width*a.x,box.y+box.height*a.y);await expect(page.locator('.controls strong').first()).toContainText((i+1)+'/5');
 }
 await expect(page.getByRole('region',{name:'클리어 결과'})).toBeVisible();
 await expect(page.getByText('누적 별 3 / 3',{exact:false})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'백업 다운로드'}).click();const download=await downloadPromise;
 const stream=(await download.createReadStream())!;const buffers:Buffer[]=[];for await(const chunk of stream)buffers.push(Buffer.from(chunk));const bytes=Buffer.concat(buffers);
 await page.getByLabel('백업 복원').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.getByText('유효한 PD3 백업 파일이 아닙니다.',{exact:false})).toBeVisible();
 await expect(page.getByText('누적 별 3 / 3',{exact:false})).toBeVisible();
 await page.getByLabel('백업 복원').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:bytes});
 await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'도전',exact:true}).click();
 await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 await expect(page.getByText('누적 별 3 / 3',{exact:false})).toBeVisible();
 expect(errors).toEqual([]);
});
test('keyboard input and saved normal session survive reload',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 const canvas=page.locator('canvas').first();await canvas.focus();
 for(let i=0;i<9;i++)await canvas.press('ArrowUp');await canvas.press('Enter');
 await expect(page.getByText('정답!',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pd3-progress',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{return await new Promise<number>(resolve=>{const r=db.transaction('state').objectStore('state').get('progress');r.onsuccess=()=>resolve(r.result?.sessions['sample-001']?.found.length??0)})}finally{db.close()}
 })).toBe(1);
 await page.reload();await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 await expect(page.locator('.controls strong').first()).toContainText('1/5');
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.locator('body').evaluate(e=>e.clientWidth));
});
