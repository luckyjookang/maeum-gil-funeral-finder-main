const test=require('node:test');
const assert=require('node:assert/strict');
const {locate,cluster}=require('../dist/map-model.js');
const rows=require('../dist/facilities.json').map((row,id)=>({...row,id}));
const {positions}=require('../dist/facility-coordinates.json');
test('all facilities have valid coordinates, including Seoul and Busan',()=>{
  assert.equal(locate(rows,positions).length,1080);
  assert.equal(locate(rows.filter(r=>r['시도']==='서울특별시'),positions).length,61);
  assert.equal(locate(rows.filter(r=>r['시도']==='부산광역시'),positions).length,55);
});
test('clustering preserves every facility exactly once at national and street zoom',()=>{
  const points=locate(rows,positions);
  for(const zoom of [6,7,10,14,17]){
    const groups=cluster(points,zoom),ids=groups.flatMap(g=>g.members.map(p=>p.id));
    assert.equal(ids.length,1080);assert.equal(new Set(ids).size,1080);
    assert.ok(groups.every(g=>Number.isFinite(g.lat)&&Number.isFinite(g.lng)));
  }
  assert.ok(cluster(points,7).length<cluster(points,14).length);
});
test('switching region removes previous region and never truncates to 30 visible cards',()=>{
  const seoul=locate(rows.filter(r=>r['시도']==='서울특별시'),positions);
  const busan=locate(rows.filter(r=>r['시도']==='부산광역시'),positions);
  const displayed=cluster(busan,11).flatMap(g=>g.members);
  assert.equal(displayed.length,55);
  assert.ok(displayed.every(p=>p.row['시도']==='부산광역시'));
  assert.ok(!displayed.some(p=>seoul.some(s=>s.id===p.id)));
  assert.equal(cluster(locate(rows,positions),7).flatMap(g=>g.members).length,1080);
});
test('unresolved or invalid coordinates never become fabricated markers',()=>{
  const samples=[{id:0,주소:'a'},{id:1,주소:'b'},{id:2,주소:'c'}];
  assert.deepEqual(locate(samples,{a:{lat:0,lng:0},b:{lat:37,lng:'127'}}),[]);
  assert.deepEqual(cluster([],7),[]);
});
test('facilities sharing a coordinate remain separate members of a clickable group',()=>{
  const points=[{id:1,lat:37.5,lng:127},{id:2,lat:37.5,lng:127}];
  const groups=cluster(points,17);assert.equal(groups.length,1);assert.equal(groups[0].members.length,2);
});
