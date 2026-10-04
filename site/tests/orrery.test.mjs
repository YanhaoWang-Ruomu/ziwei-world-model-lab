import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOLAR_PLANETS,SMALL_BODIES,ORRERY_STARS,ORRERY_ITEMS,NORTH_HIDDEN_STARS,projectAsterism} from '../src/orrery-data.mjs';
import {NORTH_LINES,SOUTH_LINES,WENCHANG_LINES} from '../src/star-profiles.mjs';
import {starCelestialIds,palaceCelestialIds} from '../src/palace-resonance.mjs';
import {orreryMarkup} from '../src/orrery.mjs';

test('solar overview preserves the eight-planet order and separates dwarf planets',()=>{
  assert.deepEqual(SOLAR_PLANETS.map(p=>p.id),['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']);
  for(let i=1;i<SOLAR_PLANETS.length;i++){
    assert.ok(SOLAR_PLANETS[i].rx>SOLAR_PLANETS[i-1].rx);
    assert.ok(SOLAR_PLANETS[i].period>SOLAR_PLANETS[i-1].period);
  }
  assert.ok(SMALL_BODIES.every(p=>!SOLAR_PLANETS.some(planet=>p.id===planet.id)));
  assert.equal(new Set(ORRERY_ITEMS.map(p=>p.id)).size,ORRERY_ITEMS.length);
});

test('asterisms retain catalogue coordinates and unknown distances without invention',()=>{
  const catalogue=JSON.parse(readFileSync(new URL('../src/sky/catalog.json',import.meta.url),'utf8'));
  const rows=catalogue.stars;
  for(const star of ORRERY_STARS){
    const row=rows.find(r=>r[0]===star.hip);
    assert.ok(row,star.name);
    assert.deepEqual([star.ra,star.dec,star.pc,star.mag],row.slice(1,5),star.name);
  }
  assert.equal(ORRERY_STARS.find(s=>s.hip===89341).pc,null);
  for(const [group,lines,count] of [['北斗',NORTH_LINES,7],['南斗',SOUTH_LINES,6],['文昌',WENCHANG_LINES,5]]){
    const box={x:20,y:30,w:160,h:100},points=projectAsterism(group,box);
    assert.equal(points.length,count);
    for(const p of points){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=20-1e-8&&p.x<=180+1e-8&&p.y>=30-1e-8&&p.y<=130+1e-8);}
    const ids=new Set(points.map(p=>p.hip));
    assert.ok(lines.every(([a,b])=>ids.has(a)&&ids.has(b)));
  }
});

test('Wenchang lights its documented asterism without inventing an individual identity',()=>{
  const ids=starCelestialIds('文昌');
  assert.deepEqual(ids,['hip-48319','hip-48402','hip-46853','hip-44901','hip-45493']);
  assert.deepEqual(palaceCelestialIds({majorStars:[{name:'太阳'}],minorStars:[{name:'文昌'},{name:'文昌'}]}),['sun',...ids]);
  assert.deepEqual(starCelestialIds('文曲'),['hip-59774']);
  assert.deepEqual(starCelestialIds('火星'),[]);
  assert.equal(ORRERY_STARS.filter(s=>s.group==='文昌'&&s.symbol).length,0);
});

test('Northern nine-star instrument preserves seven catalogue stars and two explicit cultural entries',()=>{
  const nine=ORRERY_ITEMS.filter(s=>s.group==='北斗');
  assert.equal(nine.length,9);
  assert.equal(nine.filter(s=>s.hip).length,7);
  for(const hidden of NORTH_HIDDEN_STARS){
    for(const key of ['hip','ra','dec','pc','mag'])assert.equal(hidden[key],undefined);
    assert.equal(hidden.kind,'cultural');
    assert.deepEqual(starCelestialIds(hidden.symbol),[hidden.id]);
  }
  assert.deepEqual(palaceCelestialIds({majorStars:[],minorStars:[{name:'左辅'},{name:'右弼'}]}),['north-dongming','north-yinyuan']);
  const html=orreryMarkup('nine',{interactive:true});
  assert.ok(html.includes('北斗九星')&&html.includes('辅弼二隐 · 传统意象'));
});

test('embedded and expanded instruments can coexist without broken SVG references',()=>{
  const html=orreryMarkup('square')+orreryMarkup('wheel')+orreryMarkup('expanded-solar',{interactive:true});
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const [,id] of html.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(id),id);
  for(const item of ORRERY_ITEMS)assert.ok(html.includes(`data-celestial-id="${item.id}"`),item.name);
  assert.ok(!html.includes('NaN')&&!html.includes('undefined'));
});
