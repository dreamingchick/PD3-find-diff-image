import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',fullyParallel:true,
 use:{baseURL:process.env.PD3_TEST_URL??'http://127.0.0.1:3000'},
 projects:[{name:'desktop',use:{viewport:{width:1280,height:800}}},{name:'mobile',use:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}},{name:'small-mobile',use:{viewport:{width:320,height:568},isMobile:true,hasTouch:true}},{name:'landscape',use:{viewport:{width:844,height:390},isMobile:true,hasTouch:true}}],
 webServer:process.env.PD3_TEST_URL?undefined:{command:'npm run start -w @pd3/player -- --hostname 127.0.0.1',url:'http://127.0.0.1:3000',reuseExistingServer:!process.env.CI},
});
