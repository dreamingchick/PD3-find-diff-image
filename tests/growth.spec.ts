import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {answers} from '../packages/game-engine/index.mjs';
const entry={score:4500,stars:3,elapsed:20,wrong:0,hints:0};
const legacy={records:{'sample-001:normal':{first:entry,best:entry,recent:entry,maxStars:3},'sample-001:challenge':{first:entry,best:entry,recent:entry,maxStars:3}},sessions:{}};
async function start(page:Page){await expect(page.getByRole('button',{name:/^스테이지 1 ·/})).toBeEnabled();await page.getByRole('button',{name:/^스테이지 1 ·/}).click();await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled()}
async function complete(page:Page){for(const [i,a] of answers.entries()){const b=(await page.locator('canvas').nth(i%2).boundingBox())!;await page.mouse.click(b.x+b.width*a.x,b.y+b.height*a.y);await expect(page.getByRole('progressbar',{name:'찾은 정답'})).toHaveAttribute('aria-valuenow',String(i+1))}await expect(page.getByRole('region',{name:'클리어 결과'})).toBeVisible();await expect(page.locator('.clear-reward')).not.toContainText('저장하고')}
async function read(page:Page){return page.evaluate(async()=>{const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pd3-progress',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<any>((resolve,reject)=>{const r=d.transaction('state').objectStore('state').get('progress');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{d.close()}})}
async function seed(page:Page,value:unknown){await page.evaluate(async v=>{const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pd3-progress',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction('state','readwrite');tx.objectStore('state').put(v,'progress');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})}finally{d.close()}},value)}

test('first clear rewards persist; free then stock hints and replay never repay',async({page})=>{
 await page.goto('/');await start(page);await complete(page);await expect(page.getByText('첫 완성 보상 · +100코인 · +60 EXP')).toBeVisible();await page.getByRole('button',{name:'메인으로',exact:true}).click();
 await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();
 for(const coins of [75,50]){await page.getByRole('button',{name:'힌트 교환 · 25코인',exact:true}).click();await expect(page.getByLabel(`보유 코인 ${coins}`,{exact:true})).toBeVisible()}
 await expect(page.getByLabel('보유 힌트 2',{exact:true})).toBeVisible();await start(page);
 await page.getByRole('button',{name:'힌트 1',exact:true}).click();const stock=page.getByRole('button',{name:'힌트 2',exact:true});await expect(stock).toBeEnabled();await stock.click();
 await expect.poll(async()=>{const p=await read(page);return {hints:p.wallet.hints,used:p.sessions['sample-001'].hints}}).toEqual({hints:1,used:2});
 await page.reload();await expect(page.getByLabel('보유 코인 50',{exact:true})).toBeVisible();await expect(page.getByLabel('보유 힌트 1',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^스테이지 1 ·/}).click();await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toHaveAttribute('title','보유 힌트 사용');await complete(page);
 await expect(page.getByText('이 그림의 최초 보상은 이미 받았어요.')).toBeVisible();await page.getByRole('button',{name:'메인으로',exact:true}).click();
 await page.getByRole('button',{name:'도전',exact:true}).click();await start(page);await complete(page);await page.getByRole('button',{name:'메인으로',exact:true}).click();
 const p=await read(page);expect(p.wallet).toEqual({coins:50,xp:60,hints:1,claimed:['sample-001']});expect(p.records['sample-001:normal'].recent.hints).toBe(2);expect(p.records['sample-001:normal'].recent.stars).toBe(1);
 await page.getByRole('button',{name:'설정',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'백업 다운로드'}).click();const stream=(await (await pending).createReadStream())!,chunks:Buffer[]=[];for await(const c of stream)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks),file=JSON.parse(bytes.toString());expect(file.version).toBe(2);expect(file.progress.wallet).toEqual(p.wallet);
 await page.getByLabel('백업 복원').setInputFiles({name:'wallet.json',mimeType:'application/json',buffer:bytes});await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();await page.reload();expect((await read(page)).wallet).toEqual(p.wallet);
});

test('legacy records and old backups migrate once; valid backup repairs corrupt state',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:/^스테이지 1 ·/})).toBeEnabled();await seed(page,legacy);await page.reload();await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();
 const p=await read(page);expect(p.version).toBe(2);expect(p.wallet.claimed).toEqual(['sample-001']);expect(p.wallet.xp).toBe(60);
 await page.reload();await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();await page.getByRole('button',{name:'설정',exact:true}).click();
 const file={format:'pd3-progress',version:1,progress:legacy};await page.getByLabel('백업 복원').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();expect((await read(page)).wallet.coins).toBe(100);
 await seed(page,{version:2,records:{},sessions:{},wallet:{coins:-1}});
 await page.getByLabel('백업 복원').setInputFiles({name:'repair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();await page.reload();await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();
});

test('two tabs cannot duplicate first-clear rewards or overspend coins and hints',async({page,context})=>{
 await page.goto('/');await start(page);const other=await context.newPage();await other.goto('/');await start(other);
 await Promise.all([complete(page),complete(other)]);expect((await read(page)).wallet).toEqual({coins:100,xp:60,hints:0,claimed:['sample-001']});
 await Promise.all([page.getByRole('button',{name:'메인으로',exact:true}).click(),other.getByRole('button',{name:'메인으로',exact:true}).click()]);
 for(const coins of [75,50,25]){await page.getByRole('button',{name:'힌트 교환 · 25코인',exact:true}).click();await expect(page.getByLabel(`보유 코인 ${coins}`,{exact:true})).toBeVisible()}
 await expect(other.getByLabel('보유 코인 25',{exact:true})).toBeVisible();const b1=(await page.getByRole('button',{name:'힌트 교환 · 25코인'}).boundingBox())!,b2=(await other.getByRole('button',{name:'힌트 교환 · 25코인'}).boundingBox())!;
 await Promise.all([page.mouse.click(b1.x+b1.width/2,b1.y+b1.height/2),other.mouse.click(b2.x+b2.width/2,b2.y+b2.height/2)]);
 await expect.poll(async()=>{const p=await read(page);return {coins:p.wallet.coins,hints:p.wallet.hints}}).toEqual({coins:0,hints:4});
 const p=await read(page);await seed(page,{...p,revision:p.revision+1,wallet:{...p.wallet,hints:1}});await Promise.all([page.reload(),other.reload()]);
 for(const tab of [page,other]){await tab.getByRole('button',{name:'도전',exact:true}).click();await start(tab);await tab.getByRole('button',{name:'힌트 1',exact:true}).click()}
 for(const tab of [page,other])await expect(tab.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 const h1=(await page.getByRole('button',{name:'힌트 1',exact:true}).boundingBox())!,h2=(await other.getByRole('button',{name:'힌트 1',exact:true}).boundingBox())!;
 await Promise.all([page.mouse.click(h1.x+h1.width/2,h1.y+h1.height/2),other.mouse.click(h2.x+h2.width/2,h2.y+h2.height/2)]);
 await expect.poll(async()=>(await read(page)).wallet.hints).toBe(0);expect((await read(page)).wallet.coins).toBe(0);await other.close();
});

test('a final answer cannot outrun the pending hint debit',async({page})=>{
 await page.goto('/');await start(page);
 for(const [i,a] of answers.slice(0,-1).entries()){const b=(await page.locator('canvas').nth(i%2).boundingBox())!;await page.mouse.click(b.x+b.width*a.x,b.y+b.height*a.y);await expect(page.getByRole('progressbar',{name:'찾은 정답'})).toHaveAttribute('aria-valuenow',String(i+1))}
 await page.evaluate(async()=>{
  const w=window as typeof window&{holdProgress?:boolean};w.holdProgress=true;
  const d=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pd3-progress',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const tx=d.transaction('state','readwrite'),store=tx.objectStore('state');
  await new Promise<void>(resolve=>{let first=true;function loop(){const r=store.get('progress');r.onsuccess=()=>{if(first){first=false;resolve()}if(w.holdProgress)loop()}}loop()});tx.oncomplete=()=>d.close();
 });
 try{
  await page.getByRole('button',{name:'힌트 1',exact:true}).click();const a=answers.at(-1)!,b=(await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(b.x+b.width*a.x,b.y+b.height*a.y);await expect(page.getByRole('progressbar',{name:'찾은 정답'})).toHaveAttribute('aria-valuenow','4');await expect(page.getByRole('region',{name:'클리어 결과'})).toHaveCount(0);
 }finally{await page.evaluate(()=>{(window as typeof window&{holdProgress?:boolean}).holdProgress=false})}
 await expect(page.getByRole('button',{name:'힌트 0',exact:true})).toBeVisible();const a=answers.at(-1)!,b=(await page.locator('canvas').first().boundingBox())!;
 await page.mouse.click(b.x+b.width*a.x,b.y+b.height*a.y);await expect(page.getByRole('region',{name:'클리어 결과'})).toBeVisible();
 await expect.poll(async()=>(await read(page)).records['sample-001:normal']?.recent.hints).toBe(1);expect((await read(page)).records['sample-001:normal'].recent.stars).toBe(2);
});
