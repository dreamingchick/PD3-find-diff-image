import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {answers} from '../packages/game-engine/index.mjs';
import {emptyProgress,backup} from '../packages/game-engine/progress.mjs';
import {record} from '../packages/game-engine/rewards.mjs';
async function complete(page:Page){
 await page.getByRole('button',{name:/^스테이지 1 ·/}).click();await expect(page.getByRole('button',{name:'힌트 1',exact:true})).toBeEnabled();
 for(const [i,a] of answers.entries()){const b=(await page.locator('canvas').nth(i%2).boundingBox())!;await page.mouse.click(b.x+b.width*a.x,b.y+b.height*a.y);await expect(page.getByRole('progressbar',{name:'찾은 정답'})).toHaveAttribute('aria-valuenow',String(i+1))}
 await expect(page.locator('.clear-reward')).not.toContainText('저장하고');await page.getByRole('button',{name:'메인으로',exact:true}).click();
}
test('real clears derive badges across modes reload and tabs without another coin grant',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:/^스테이지 1 ·/})).toBeEnabled();
 const observer=await context.newPage();await observer.goto('/');await observer.getByRole('button',{name:'배지',exact:true}).click();await expect(observer.getByLabel('획득한 배지 0 / 7',{exact:true})).toBeVisible();
 await complete(page);await expect(observer.getByLabel('획득한 배지 2 / 7',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'배지 보관함 열기'}).click();await expect(page.getByRole('article',{name:'첫 발견 · 획득',exact:true})).toBeVisible();await expect(page.getByRole('article',{name:'반짝이는 눈 · 획득',exact:true})).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'작은 산책 달성 진행'})).toHaveAttribute('value','1');
 await page.getByRole('button',{name:'메인',exact:true}).click();await page.getByRole('button',{name:'도전',exact:true}).click();await complete(page);
 await page.getByRole('button',{name:'배지',exact:true}).click();await expect(page.getByLabel('획득한 배지 3 / 7',{exact:true})).toBeVisible();await expect(page.getByText('그림 1개 완성 · 별 3개',{exact:true})).toBeVisible();await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();
 await expect(observer.getByRole('article',{name:'도전의 시작 · 획득',exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'배지',exact:true}).click();await expect(page.getByLabel('획득한 배지 3 / 7',{exact:true})).toBeVisible();await expect(page.getByLabel('보유 코인 100',{exact:true})).toBeVisible();
 await observer.close();
});
test('historical backup records populate collections and restoring empty progress removes derived badges',async({page},testInfo)=>{
 const p=emptyProgress(),entry={score:4500,stars:3,elapsed:20,wrong:0,hints:0};
 for(const id of ['archive-a','archive-b','archive-c'])p.records[id+':normal']=record(undefined,entry);
 p.wallet={coins:300,xp:180,hints:0,claimed:['archive-a','archive-b','archive-c']};
 await page.goto('/');await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByLabel('백업 복원').setInputFiles({name:'history.json',mimeType:'application/json',buffer:Buffer.from(backup(p))});await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'배지',exact:true}).click();await expect(page.getByLabel('획득한 배지 4 / 7',{exact:true})).toBeVisible();await expect(page.getByRole('progressbar',{name:'그림 수집가 달성 진행'})).toHaveAttribute('value','3');await expect(page.getByRole('progressbar',{name:'별빛 수집가 달성 진행'})).toHaveAttribute('value','9');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const name of ['메인','내 기록','배지','설정'])await expect(page.getByRole('navigation',{name:'메인 메뉴'}).getByRole('button',{name,exact:true})).toBeInViewport();
 await page.screenshot({path:testInfo.outputPath('discovery-badges.png'),fullPage:true});
 await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByLabel('백업 복원').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(backup(emptyProgress()))});await expect(page.getByText('진행을 복원했습니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'배지',exact:true}).click();await expect(page.getByLabel('획득한 배지 0 / 7',{exact:true})).toBeVisible();await expect(page.getByLabel('보유 코인 0',{exact:true})).toBeVisible();
});
