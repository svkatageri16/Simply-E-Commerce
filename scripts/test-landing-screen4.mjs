import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createTranslator } from '../packages/i18n/dist/index.js';

const out=path.resolve(process.env.SCREEN4_ARTIFACTS || 'artifacts/catalog-theme-polish');
fs.mkdirSync(out,{recursive:true});
const base=process.env.STOREFRONT_URL || 'http://localhost:3000';
const sizes=[[1920,1080],[1680,945],[1440,900],[1280,800],[768,1024],[390,844]];
const categories=[
  ['fashion','Urban Loom','Everyday Shirt','urbanloom'],
  ['beauty','Pure & Co.','Face Serum','pureandco'],
  ['jewellery','Aura Jewellery','Pendant','aurajewellery'],
  ['food','Daily Bakehouse','Croissant','dailybakehouse'],
  ['handicrafts','Crafted India','Ceramic Vase','craftedindia'],
  ['groceries','Daily Basket','Rice','dailybasket'],
];
const frozenPath=path.resolve(process.env.SCREEN4_FROZEN || 'artifacts/catalog-theme-polish/screen4-frozen.json');
const frozen=fs.existsSync(frozenPath)?JSON.parse(fs.readFileSync(frozenPath)):null;
const results=[],errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext();
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const initial=await page.locator('#storefront-theme-rail').evaluate(e=>({
    scrollLeft:e.scrollLeft,
    firstOffset:e.firstElementChild.getBoundingClientRect().left-e.getBoundingClientRect().left,
    order:[...e.children].map(card=>card.dataset.themePreview),
  }));
  assert.equal(initial.scrollLeft,0,'fresh carousel starts at zero');
  assert.ok(Math.abs(initial.firstOffset)<1,'first card starts cleanly');
  assert.deepEqual(initial.order,['canvas','aura','horizon','feast','atelier','harvest']);
  for(const locale of ['en-IN','mr-IN','hi-IN']){
    const t=createTranslator(locale);
    await page.setViewportSize({width:1680,height:945});
    await page.getByRole('button',{name:locale==='en-IN'?'English':locale==='mr-IN'?'मराठी':'हिंदी',exact:true}).first().click();
    for(const [width,height]of sizes){
      await page.setViewportSize({width,height});
      for(const [id,store,firstProduct,slug]of categories){
        await page.locator('[data-category="'+id+'"]').click();
        await page.waitForTimeout(150);
        assert.equal(await page.locator('[data-category="'+id+'"]').getAttribute('aria-pressed'),'true');
        for(const preview of ['showcase-desktop','showcase-mobile']){
          const target=page.getByTestId(preview);
          assert.equal(await target.getAttribute('data-active-category'),id);
          assert.equal(await target.locator('[data-store-name]').textContent(),store);
          assert.match(await target.textContent(),new RegExp(firstProduct.replace(/[.*+?^$()|[\]\\]/g,'\\$&')));
        }
        assert.equal(await page.getByTestId('showcase-store-link').textContent(),slug+'.letzshop.store');
        assert.equal(await page.locator('#business-store-preview').locator('img').count(),0,'preview is HTML/SVG');
        const geometry=await page.getByTestId('screen4-showcase').evaluate(section=>{
          const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
          const bad=[...section.querySelectorAll('h2,h3,h4,p,code')].filter(visible).filter(e=>!e.classList.contains('sr-only')&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent);
          const selector=section.querySelector('[data-category]').parentElement.getBoundingClientRect();
          const preview=section.querySelector('#business-store-preview').getBoundingClientRect();
          const benefits=section.querySelector('[data-testid="theme-gallery"]').getBoundingClientRect();
          return{overflow:document.documentElement.scrollWidth>innerWidth,bad,selectorBottom:selector.bottom,previewTop:preview.top,previewBottom:preview.bottom,benefitTop:benefits.top};
        });
        assert.equal(geometry.overflow,false,locale+' '+width+' '+id+' document overflow');
        assert.deepEqual(geometry.bad,[],locale+' '+width+' '+id+' text clipping');
        assert.ok(geometry.selectorBottom<=geometry.previewTop+1,'controls clear of preview');
        assert.ok(geometry.previewBottom<=geometry.benefitTop+1,'benefits clear of preview');
        results.push({locale,width,height,category:id,result:'PASS'});
      }
      await page.locator('[data-category="fashion"]').click();
      await page.waitForTimeout(250);
      await page.evaluate(()=>document.fonts.ready);
      if(frozen?.[locale+'-'+width]){
        const expected=frozen[locale+'-'+width];
        const current=await page.evaluate(()=>{
          const g=e=>{const r=e.getBoundingClientRect();return{html:e.outerHTML,text:e.textContent,x:r.x,y:r.y+scrollY,width:r.width,height:r.height}};
          const section=document.querySelector('#themes');
          return {screens:[...document.querySelectorAll('main > section')].slice(0,3).map(g),heading:g(section.querySelector('h2').parentElement),selector:g(section.querySelector('[data-category]').parentElement.parentElement),preview:g(section.querySelector('#business-store-preview'))};
        });
        for(const key of ['heading','selector','preview']){
          const canonical=await page.evaluate(htmls=>htmls.map(html=>{
            const doc=new DOMParser().parseFromString(html,'text/html');
            doc.querySelectorAll('[style]').forEach(e=>e.setAttribute('style',e.style.cssText));
            const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_COMMENT);const comments=[];
            while(walker.nextNode())comments.push(walker.currentNode);comments.forEach(e=>e.remove());
            return doc.body.innerHTML;
          }),[current[key].html,expected[key].html]);
          assert.ok(canonical[0]===canonical[1],'approved main '+key+' markup unchanged');
          for(const dimension of ['x','y','width','height'])assert.ok(Math.abs(current[key][dimension]-expected[key][dimension])<.05,'approved main '+key+' '+dimension+' unchanged');
        }
        const expectedText=await page.evaluate(screens=>screens.map(s=>new DOMParser().parseFromString(s.html,'text/html').body.textContent),expected.screens);
        for(let i=0;i<3;i++){
          assert.equal(current.screens[i].text,expectedText[i],'Screen '+(i+1)+' frozen text');
          for(const dimension of ['x','y','width','height'])assert.ok(Math.abs(current.screens[i][dimension]-expected.screens[i][dimension])<.05,'Screen '+(i+1)+' '+dimension+' unchanged');
        }
      }
      assert.match(await page.getByTestId('screen4-showcase').textContent(),new RegExp(t('landing.businessShowcase.eyebrow')));
      const gallery=page.getByTestId('theme-gallery');
      const rail=page.locator('#storefront-theme-rail');
      assert.equal(await page.getByTestId('showcase-benefits').count(),0,'generic benefits removed');
      assert.equal(await gallery.locator('[data-theme-preview]').count(),6);
      assert.equal(await gallery.locator('iframe').count(),0,'no heavy theme iframes');
      assert.equal(await gallery.getByRole('heading',{name:t('landing.themeGallery.title'),exact:true}).count(),1);
      assert.deepEqual(await gallery.locator('[data-theme-preview]').evaluateAll(cards=>cards.map(card=>card.dataset.themePreview)),['canvas','aura','horizon','feast','atelier','harvest']);
      for(const id of ['canvas','aura','horizon','feast','atelier','harvest']){
        const card=gallery.locator('[data-theme-preview="'+id+'"]');
        const image=card.locator('img');
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(image=>image.decode());
        assert.ok(await image.getAttribute('alt'),'meaningful preview alt text');
        const dimensions=await image.evaluate(image=>({natural:image.naturalWidth,display:image.clientWidth}));
        assert.equal(dimensions.natural,1008);
        assert.ok(dimensions.display<=dimensions.natural,'preview never upscaled');
        if(width>=1440)assert.ok(dimensions.display>=260&&dimensions.display<=330,'readable desktop theme width');
      }
      await rail.focus();
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
      assert.ok(await rail.evaluate(e=>e.scrollLeft<2));
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
      assert.ok(await rail.evaluate(e=>e.scrollLeft>100),'keyboard next theme');
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
      assert.ok(await rail.evaluate(e=>Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2),'keyboard end');
      await page.keyboard.press('Home');
      if(width>=768){
        await gallery.getByRole('button',{name:t('landing.themeGallery.next'),exact:true}).click();
        await page.waitForTimeout(500);
        assert.ok(await rail.evaluate(e=>e.scrollLeft>100),'next theme arrow');
        await gallery.getByRole('button',{name:t('landing.themeGallery.previous'),exact:true}).click();
        await page.waitForTimeout(500);
        assert.ok(await rail.evaluate(e=>e.scrollLeft<2),'previous theme arrow');
      }
      // Mouse drag uses the native rail; touch retains native scrolling.
      const box=await rail.boundingBox();
      await page.mouse.move(box.x+box.width*.75,box.y+70);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width*.2,box.y+70,{steps:12});
      await page.mouse.up();
      await page.waitForTimeout(400);
      assert.ok(await rail.evaluate(e=>e.scrollLeft>100),'mouse drag scrolls');
      await rail.focus();await page.keyboard.press('Home');
      await rail.evaluate(e=>e.blur());
      await gallery.screenshot({path:path.join(out,'theme-gallery-'+locale+'-'+width+'.png')});

      await page.getByTestId('screen4-showcase').screenshot({path:path.join(out,'screen4-'+locale+'-'+width+'.png')});
      if(locale==='en-IN'){
        await page.evaluate(()=>scrollTo({top:document.querySelector('#themes').getBoundingClientRect().top+scrollY-68,behavior:'instant'}));
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(out,'screen4-viewport-'+width+'x'+height+'.png')});
      }
    }
    await page.setViewportSize({width:1680,height:945});
    await page.locator('[data-category="fashion"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-category="beauty"]').getAttribute('aria-pressed'),'true');
    assert.ok(await page.locator('[data-category="beauty"]').evaluate(e=>document.activeElement===e),'keyboard focus follows selection');
    await page.getByRole('button',{name:t('landing.businessShowcase.next'),exact:true}).click();
    assert.equal(await page.locator('[data-category="jewellery"]').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:t('landing.businessShowcase.previous'),exact:true}).click();
    assert.equal(await page.locator('[data-category="beauty"]').getAttribute('aria-pressed'),'true');
  }
  const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const touchPage=await touchContext.newPage();
  await touchPage.goto(base,{waitUntil:'networkidle'});
  const touchRail=touchPage.locator('#storefront-theme-rail');
  await touchRail.scrollIntoViewIfNeeded();
  const touchBox=await touchRail.boundingBox();
  const cdp=await touchContext.newCDPSession(touchPage);
  const touchY=Math.max(30,touchBox.y+90);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:touchY}]});
  for(let x=310;x>=70;x-=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:touchY}]});await touchPage.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await touchPage.waitForTimeout(700);
  assert.ok(await touchRail.evaluate(e=>e.scrollLeft>100),'native mobile swipe');
  assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile swipe keeps page within viewport');
  await touchContext.close();
  await page.getByRole('button',{name:'English',exact:true}).first().click();
  const register=page.locator('header a[href$="/register"]').first();
  const registerHref=await register.getAttribute('href');
  await register.click();
  await page.locator('#register-phone').waitFor();
  assert.ok(page.url().endsWith('/register'),'Create Store route');
  await page.goto(base);
  const login=page.locator('header a[href$="/login"]').first();
  const loginHref=await login.getAttribute('href');
  await login.click();
  await page.locator('#login-phone').waitFor();
  assert.ok(page.url().endsWith('/login'),'Merchant Login route');
  assert.deepEqual(errors,[],'no browser runtime errors');
  fs.writeFileSync(path.join(out,'screen4-results.json'),JSON.stringify({cases:results.length,results,keyboard:'PASS',createStore:registerHref,merchantLogin:loginHref,frozenScreens:frozen?'PASS':'not supplied',runtimeErrors:errors},null,2));
  console.log(JSON.stringify({cases:results.length,keyboard:'PASS',createStore:'PASS',merchantLogin:'PASS',frozenScreens:frozen?'PASS':'not supplied',runtimeErrors:errors}));
  await context.close();
}finally{await browser.close();}
