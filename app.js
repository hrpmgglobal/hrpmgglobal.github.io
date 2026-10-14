
(function(){
'use strict';
var UNITS=['ชิ้น','กล่อง','ตัวอย่าง','ชุด','ลัง','ถุง','แพ็ค','ถัง','ม้วน','เครื่อง','พาเลท','อื่น ๆ'];
var ROLE={employee:'พนักงาน',approver:'ผู้อนุมัติ',security:'เจ้าหน้าที่รักษาความปลอดภัย'};
var ST={pending:['รออนุมัติ','warn'],approved:['อนุมัติแล้ว','info'],out:['รถออกแล้ว','info'],rejected:['ไม่อนุมัติ','bad'],completed:['เสร็จสิ้น','ok']};
var CFG=window.PMG_CONFIG||{};
var sb=null;
var S={me:null,tab:'',flt:'all',emps:[],vehicles:[],drivers:[],reqs:[],loaded:{},pax:[],items:[],pend:{out:[],'in':[]},busy:false,cur:null,month:'',sumMode:'car',armonth:'',arch:null,archMsg:''};

function $(s,r){return (r||document).querySelector(s);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad(n){return String(n).padStart(2,'0');}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function nowT(){var d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes());}
function nowDT(){return today()+'T'+nowT();}
function fmtD(s){if(!s)return '-';var p=String(s).slice(0,10).split('-');if(p.length<3)return s;return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function fmtDT(s){if(!s)return '-';var d=new Date(s);if(isNaN(d))return s;return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})+' '+pad(d.getHours())+':'+pad(d.getMinutes())+' น.';}
function rid(n){var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',o='';for(var i=0;i<n;i++)o+=c[Math.floor(Math.random()*c.length)];return o;}
function mkNo(p){return p+'-'+today().replace(/-/g,'')+'-'+rid(4);}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
var tt;
function toast(m,bad){var t=$('#toast');t.textContent=m;t.className='toast'+(bad?' bad':'');t.hidden=false;clearTimeout(tt);tt=setTimeout(function(){t.hidden=true;},3600);}
function empBy(code){code=String(code||'').trim().toUpperCase();return S.emps.find(function(e){return e.code===code;});}
function dbErr(e){var c=e&&e.code,m=(e&&e.message)||'';
  if(c==='42501'||/row-level security|permission denied/i.test(m))return 'ไม่มีสิทธิ์ทำรายการนี้';
  if(c==='23503')return 'ลบไม่ได้ เพราะมีคำขอที่อ้างถึงรายการนี้อยู่';
  if(c==='23505')return 'ข้อมูลนี้มีอยู่แล้ว';
  if(/ห้าม|ผู้อนุมัติแก้|รปภ\. แก้|ไม่มีสิทธิ์/.test(m))return m;
  return 'บันทึกไม่สำเร็จ กรุณาลองใหม่';}
/* ---------- sheet ---------- */
function openSheet(title,html){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('#sheet').hidden=false;$('#sheetBody').scrollTop=0;}
function closeSheet(){$('#sheet').hidden=true;$('#sheetBody').innerHTML='';S.cur=null;}

/* ---------- data (Supabase) ---------- */
function mapEmp(r){return {id:r.code,code:r.code,name:r.name,dept:r.dept||'',position:r.position||'',role:r.role,claimedBy:r.line_user_id||null,lineName:r.line_name||''};}
function mapReq(r){return {id:r.no,no:r.no,type:r.type,status:r.status,createdAt:r.created_at,by:{code:r.created_by,name:r.by_name,dept:r.by_dept||''},f:r.f||{},appr:r.appr||null,sec:r.sec||null};}
var loadTimer=null,chan=null;
async function loadAll(){
  if(!sb||!S.me)return;
  var r=await Promise.all([
    sb.from('employees').select('*').order('code'),
    sb.from('vehicles').select('*').order('plate'),
    sb.from('drivers').select('*').order('name'),
    sb.from('requests').select('*').order('created_at',{ascending:false}).limit(1000)]);
  if(!r[0].error)S.emps=r[0].data.map(mapEmp);
  if(!r[1].error)S.vehicles=r[1].data;
  if(!r[2].error)S.drivers=r[2].data;
  if(!r[3].error)S.reqs=r[3].data.map(mapReq);
  S.loaded={emps:true,vehicles:true,drivers:true,reqs:true};
  if(!r[0].error&&!S.emps.some(function(e){return e.code===S.me.code;})){toast('บัญชีนี้ถูกยกเลิกสิทธิ์แล้ว',true);logout();return;}
  onData();
}
function scheduleLoad(){clearTimeout(loadTimer);loadTimer=setTimeout(loadAll,350);}
function startData(){
  loadAll();
  if(chan)return;
  chan=sb.channel('pmg-live').on('postgres_changes',{event:'*',schema:'public'},scheduleLoad).subscribe();
}
function onData(){
  if(!S.me)return;
  $('#empList').innerHTML=S.emps.map(function(e){return '<option value="'+esc(e.code)+'">'+esc(e.name)+'</option>';}).join('');
  var m=empBy(S.me.code);if(m)S.me=m;
  renderApp();
}
async function myEmployee(){
  var s=await sb.auth.getSession();if(!s.data||!s.data.session)return null;
  var q=await sb.from('employees').select('*').eq('auth_uid',s.data.session.user.id).maybeSingle();
  return q.data?mapEmp(q.data):null;
}
function loginNote(msg,bad){
  var n=$('#loginNote');if(!n)return;
  n.textContent=msg||(CFG.LIFF_ID?'เข้าสู่ระบบด้วยบัญชี LINE ที่ผูกกับรหัสพนักงาน':'โหมดทดลอง: ยังไม่ได้ตั้งค่า LINE (LIFF) ระบบจะใช้รหัสพนักงานแทน');
  n.className='note'+(bad?' err':'');
}

/* ---------- login ---------- */
var liffOk=false;
async function liffInit(){if(!liffOk){await window.liff.init({liffId:CFG.LIFF_ID});liffOk=true;}}
async function lineLogin(code,nameIn){
  var tok,name=nameIn||'';
  if(CFG.LIFF_ID&&window.liff){
    await liffInit();
    if(!window.liff.isLoggedIn()){window.liff.login();return {redirect:true};}
    tok=window.liff.getIDToken();
    try{name=(await window.liff.getProfile()).displayName||name;}catch(e){}
  }else{
    if(!code)return {needCode:true};
    tok='dev:'+code;
  }
  var r=await sb.functions.invoke('line-login',{body:{idToken:tok,code:code||'',lineName:name}});
  if(r.error){
    var j=null;try{j=await r.error.context.json();}catch(e){}
    if(j&&j.need_code)return {needCode:true};
    return {error:(j&&j.error)||'เข้าสู่ระบบไม่สำเร็จ'};
  }
  var ss=await sb.auth.setSession({access_token:r.data.session.access_token,refresh_token:r.data.session.refresh_token});
  if(ss.error)return {error:'บันทึกเซสชันไม่สำเร็จ'};
  S.me=mapEmp(r.data.employee);
  return {ok:true};
}
function handleLogin(r){
  if(r.ok)finishLogin();
  else if(r.needCode)openCode();
  else if(r.error){loginNote(r.error,true);toast(r.error,true);}
}
async function startLogin(){
  if(S.busy)return;S.busy=true;loginNote('กำลังเข้าสู่ระบบ...');
  try{handleLogin(await lineLogin('',''));}catch(e){loginNote('เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',true);}
  S.busy=false;
}
function openCode(){
  openSheet('ยืนยันรหัสพนักงาน',
   '<div class="linebox"><div class="lineico">LINE</div><div class="note">ผูกบัญชี LINE กับรหัสพนักงานครั้งแรก ระบบจะกำหนดสิทธิ์ตามตำแหน่งในทะเบียน</div></div>'+
   '<div class="fs">'+(CFG.LIFF_ID?'':'<div class="fld"><label for="lg-line">ชื่อที่แสดงใน LINE</label><input id="lg-line" autocomplete="off"></div>')+
   '<div class="fld"><label for="lg-code">รหัสพนักงาน</label><input id="lg-code" autocomplete="off" autocapitalize="characters" placeholder="เช่น PMG001"></div>'+
   '<button class="btn line" data-act="login">ยืนยันและเข้าใช้งาน</button></div>');
}
async function doLogin(){
  var code=$('#lg-code').value.trim().toUpperCase(),ln=$('#lg-line')?$('#lg-line').value.trim():'';
  if(!code){toast('กรอกรหัสพนักงาน',true);return;}
  if(S.busy)return;S.busy=true;
  try{
    var r=await lineLogin(code,ln);
    if(r.ok)finishLogin();else if(r.error)toast(r.error,true);
  }catch(e){toast('เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',true);}
  S.busy=false;
}
function finishLogin(){closeSheet();showApp();startData();}
async function logout(){
  try{await sb.auth.signOut();}catch(e){}
  S.me=null;S.emps=[];S.reqs=[];S.loaded={};closeSheet();
  $('#app').hidden=true;$('#login').hidden=false;loginNote();
}

/* ---------- app shell ---------- */
function showApp(){
  $('#login').hidden=true;$('#app').hidden=false;
  S.tab=tabsFor(S.me.role)[0].id;renderApp();
}
function tabsFor(role){
  if(role==='security')return [{id:'guard',t:'รปภ. ดำเนินการ'},{id:'hist',t:'ประวัติ'},{id:'sum',t:'สรุปรายเดือน'}];
  if(role==='approver')return [{id:'approve',t:'ขออนุมัติ'},{id:'forms',t:'แบบฟอร์ม'},{id:'hist',t:'ประวัติทั้งหมด'},{id:'sum',t:'สรุปรายเดือน'},{id:'registry',t:'ทะเบียน'}];
  return [{id:'forms',t:'แบบฟอร์ม'},{id:'mine',t:'คำขอของฉัน'}];
}
function pendingCount(){return S.reqs.filter(function(r){return r.status==='pending';}).length;}
function renderApp(){
  var m=S.me;if(!m)return;
  $('#hello').innerHTML='<span>สวัสดี,</span><b>'+esc(m.name)+'</b><small>'+esc((m.position||'')+(m.position?' · ':'')+(ROLE[m.role]||''))+'</small>';
  var tabs=tabsFor(m.role);
  if(!tabs.some(function(t){return t.id===S.tab;}))S.tab=tabs[0].id;
  $('#tabs').innerHTML=tabs.map(function(t){
    var b=(t.id==='approve'&&pendingCount())?'<span class="badge">'+pendingCount()+'</span>':'';
    return '<button class="tab" data-act="tab" data-id="'+t.id+'" aria-current="'+(t.id===S.tab)+'">'+esc(t.t)+b+'</button>';
  }).join('');
  var v={forms:vForms,mine:vMine,approve:vApprove,hist:vHist,registry:vRegistry,guard:vGuard,sum:vSum}[S.tab];
  $('#main').innerHTML='<div class="sect">'+(v?v():'')+'</div>';
}
function rtitle(r){
  if(r.type==='car')return 'ขอใช้รถ ไป '+(r.f.dest||'-');
  return 'นำสิ่งของมีค่า'+(r.f.dir==='in'?'เข้า':'ออก')+' · '+(r.f.company||'-');
}
function rsub(r){
  if(r.type==='car')return fmtD(r.f.date)+' '+esc(r.f.time||'')+' · ผู้ขอ '+esc(r.by.name)+' · รถ '+esc(r.f.plate||'-');
  return fmtD(r.createdAt)+' · ผู้ขอ '+esc(r.by.name)+' · '+(r.f.items||[]).length+' รายการ';
}
function card(r){
  var s=ST[r.status]||['',''];
  return '<button class="card" data-act="detail" data-id="'+esc(r.id)+'"><span class="h">'+esc(rtitle(r))+'</span><span class="pill '+s[1]+'">'+s[0]+'</span><span class="s">'+rsub(r)+'</span><span class="no">'+esc(r.no)+'</span></button>';
}
function listOf(arr,emptyMsg){
  if(!S.loaded.reqs)return '<div class="empty">กำลังโหลด...</div>';
  return arr.length?'<div class="list">'+arr.map(card).join('')+'</div>':'<div class="empty">'+emptyMsg+'</div>';
}
function chips(){
  var o=[['all','ทั้งหมด'],['pending','รออนุมัติ'],['approved','อนุมัติแล้ว'],['out','รถออกแล้ว'],['completed','เสร็จสิ้น'],['rejected','ไม่อนุมัติ']];
  return '<div class="chips">'+o.map(function(x){return '<button class="chip" data-act="flt" data-id="'+x[0]+'" aria-pressed="'+(S.flt===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';
}
function vForms(){
  var mine=S.reqs.filter(function(r){return r.by&&r.by.code===S.me.code;}).slice(0,3);
  return '<h2>ทรัพยากรบุคคลและธุรการ</h2><div class="tiles">'+
   '<button class="tile" data-act="newCar"><div><b>1. การขอใช้รถ</b><span class="d">ระบุวันเวลา ปลายทาง ผู้โดยสาร ทะเบียนรถ และพนักงานขับรถ</span></div><span class="cbtn t" aria-hidden="true">+</span></button>'+
   '<button class="tile" data-act="newGoods"><div><b>2. ใบอนุญาตนำสิ่งของมีค่าเข้า-ออกบริษัท</b><span class="d">ระบุผู้ขออนุญาต รายการสิ่งของ น้ำหนัก และวัตถุประสงค์</span></div><span class="cbtn o" aria-hidden="true">+</span></button></div>'+
   '<h2>คำขอล่าสุดของฉัน</h2>'+listOf(mine,'ยังไม่มีคำขอ เลือกแบบฟอร์มด้านบนเพื่อเริ่ม');
}
function vMine(){
  var a=S.reqs.filter(function(r){return r.by&&r.by.code===S.me.code&&(S.flt==='all'||r.status===S.flt);});
  return '<h2>คำขอของฉัน</h2>'+chips()+listOf(a,'ไม่มีรายการในสถานะนี้');
}
function vApprove(){
  var a=S.reqs.filter(function(r){return r.status==='pending';}).reverse();
  return '<h2>รอการอนุมัติ</h2>'+listOf(a,'ไม่มีรายการรออนุมัติ');
}
function vHist(){
  var a=S.reqs.filter(function(r){return S.flt==='all'||r.status===S.flt;});
  if(S.me.role==='security')a=a.filter(function(r){return r.status!=='pending';});
  return '<h2>ประวัติ</h2>'+chips()+listOf(a,'ไม่มีรายการในสถานะนี้');
}
function vGuard(){
  var a=S.reqs.filter(function(r){return r.status==='approved'||r.status==='out';}).reverse();
  return '<h2>รอเจ้าหน้าที่ดำเนินการ</h2><p class="note" style="margin:0">เปิดรายการเพื่อบันทึกเวลา เลขไมล์ รูปถ่าย หรือตรวจสิ่งของ</p>'+listOf(a,'ไม่มีรายการที่ต้องดำเนินการ');
}

/* ---------- registry (approver) ---------- */
function vRegistry(){
  var emps=S.emps.slice().sort(function(a,b){return a.code<b.code?-1:1;});
  var h='<div class="fs reg"><h3>พนักงาน <button class="btn sm" data-act="empEdit" data-id="">เพิ่ม</button></h3>';
  h+=emps.length?emps.map(function(e){
    return '<div class="mini"><div class="l"><b>'+esc(e.code)+'</b> '+esc(e.name)+'<br><span class="note">'+esc(e.dept||'-')+' · '+esc(e.position||'-')+' · '+esc(ROLE[e.role]||ROLE.employee)+(e.claimedBy?' · ผูก LINE แล้ว':'')+'</span></div>'+
    '<div class="row"><button class="btn ghost sm" data-act="empEdit" data-id="'+esc(e.id)+'">แก้ไข</button>'+(e.claimedBy?'<button class="btn ghost sm" data-act="unclaim" data-id="'+esc(e.id)+'">รีเซ็ต LINE</button>':'')+'<button class="btn bad sm" data-act="del" data-col="employees" data-id="'+esc(e.id)+'">ลบ</button></div></div>';
  }).join(''):'<div class="empty">ยังไม่มีพนักงาน</div>';
  h+='</div>';
  h+='<div class="fs reg"><h3>ทะเบียนรถ <button class="btn sm" data-act="vehAdd">เพิ่ม</button></h3>';
  h+=S.vehicles.length?S.vehicles.map(function(v){return '<div class="mini"><div class="l"><b>'+esc(v.plate)+'</b> <span class="note">'+esc(v.note||'')+'</span></div><button class="btn bad sm" data-act="del" data-col="vehicles" data-id="'+esc(v.id)+'">ลบ</button></div>';}).join(''):'<div class="empty">ยังไม่มีทะเบียนรถ</div>';
  h+='</div>';
  h+='<div class="fs reg"><h3>พนักงานขับรถ <button class="btn sm" data-act="drvAdd">เพิ่ม</button></h3>';
  h+=S.drivers.length?S.drivers.map(function(v){return '<div class="mini"><div class="l"><b>'+esc(v.name)+'</b></div><button class="btn bad sm" data-act="del" data-col="drivers" data-id="'+esc(v.id)+'">ลบ</button></div>';}).join(''):'<div class="empty">ยังไม่มีพนักงานขับรถ</div>';
  h+='</div>';
  return h;
}
function empEdit(id){
  var e=id?S.emps.find(function(x){return x.id===id;}):{role:'employee'};if(!e)return;
  openSheet(id?'แก้ไขพนักงาน':'เพิ่มพนักงาน',
   '<div class="fs"><div class="g2"><div class="fld"><label for="ee-code">รหัสพนักงาน</label><input id="ee-code" value="'+esc(e.code||'')+'" '+(id?'disabled':'')+' autocapitalize="characters"></div>'+
   '<div class="fld"><label for="ee-name">ชื่อ-นามสกุล</label><input id="ee-name" value="'+esc(e.name||'')+'"></div>'+
   '<div class="fld"><label for="ee-dept">แผนก</label><input id="ee-dept" value="'+esc(e.dept||'')+'"></div>'+
   '<div class="fld"><label for="ee-pos">ตำแหน่ง</label><input id="ee-pos" value="'+esc(e.position||'')+'"></div>'+
   '<div class="fld"><label for="ee-role">สิทธิ์การใช้งาน</label><select id="ee-role">'+Object.keys(ROLE).map(function(k){return '<option value="'+k+'"'+(e.role===k?' selected':'')+'>'+ROLE[k]+'</option>';}).join('')+'</select></div></div>'+
   '<button class="btn" data-act="empSave" data-id="'+esc(id||'')+'">บันทึก</button></div>');
}
async function empSave(id){
  var code=id||$('#ee-code').value.trim().toUpperCase(),name=$('#ee-name').value.trim();
  if(!/^[A-Z0-9_.-]+$/.test(code)||!name){toast('กรอกรหัส (ตัวอักษรอังกฤษหรือตัวเลข) และชื่อ',true);return;}
  if(!id&&empBy(code)){toast('รหัสนี้มีอยู่แล้ว',true);return;}
  var d={code:code,name:name,dept:$('#ee-dept').value.trim(),position:$('#ee-pos').value.trim(),role:$('#ee-role').value};
  var r=await sb.from('employees').upsert(d,{onConflict:'code'});
  if(r.error){toast(dbErr(r.error),true);return;}
  closeSheet();toast('บันทึกแล้ว');loadAll();
}
function simpleAdd(title,fields,col,mk){
  openSheet(title,'<div class="fs">'+fields+'<button class="btn" data-act="simpleSave" data-col="'+col+'" data-mk="'+mk+'">บันทึก</button></div>');
}
async function simpleSave(col,mk){
  var d;
  if(mk==='veh'){var p=$('#sa-a').value.trim();if(!p){toast('กรอกทะเบียนรถ',true);return;}d={plate:p,note:$('#sa-b').value.trim()};}
  else{var n=$('#sa-a').value.trim();if(!n){toast('กรอกชื่อ',true);return;}d={name:n};}
  var r=await sb.from(col).insert(d);
  if(r.error){toast(dbErr(r.error),true);return;}
  closeSheet();toast('เพิ่มแล้ว');loadAll();
}
var armed={};
async function delDoc(el){
  var col=el.dataset.col,k=col+'/'+el.dataset.id;
  if(!armed[k]){armed[k]=1;el.textContent='ยืนยันลบ';setTimeout(function(){delete armed[k];if(el.isConnected)el.textContent='ลบ';},3500);return;}
  delete armed[k];
  var r=await sb.from(col).delete().eq(col==='employees'?'code':'id',el.dataset.id);
  if(r.error)toast(dbErr(r.error),true);else{toast('ลบแล้ว');loadAll();}
}
/* ---------- photos (Supabase Storage) ---------- */
function shrink(file){return new Promise(function(res,rej){
  var url=URL.createObjectURL(file),im=new Image();
  im.onload=function(){var m=1280,sc=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*sc));c.height=Math.max(1,Math.round(im.height*sc));c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(function(b){b?res(b):rej();},'image/jpeg',.75);};
  im.onerror=function(){URL.revokeObjectURL(url);rej();};im.src=url;});}
async function addPhotos(kind,input){
  var files=Array.prototype.slice.call(input.files||[]);
  for(var i=0;i<files.length;i++){
    if(S.pend[kind].length>=4){toast('แนบได้สูงสุด 4 รูปต่อช่วง',true);break;}
    try{var b=await shrink(files[i]);S.pend[kind].push({blob:b,url:URL.createObjectURL(b)});}catch(e){toast('อ่านไฟล์รูปไม่ได้',true);}
  }
  input.value='';drawPend(kind);
}
function drawPend(kind){
  var el=$('#pv-'+kind);if(!el)return;
  el.innerHTML=S.pend[kind].map(function(u,i){return '<span style="position:relative"><img src="'+u.url+'" alt="รูปที่แนบ '+(i+1)+'" data-act="zoom"><button class="btn bad sm" style="position:absolute;top:2px;right:2px;min-height:26px;padding:0 7px" data-act="rmPhoto" data-k="'+kind+'" data-i="'+i+'" aria-label="ลบรูป">×</button></span>';}).join('');
}
function photoBlock(kind,label){
  return '<div class="fld"><label for="ph-'+kind+'">'+label+'</label><input id="ph-'+kind+'" type="file" accept="image/*" multiple data-ph="'+kind+'"><div class="thumbs" id="pv-'+kind+'"></div></div>';
}
async function upPhotos(reqId,kind){
  for(var i=0;i<S.pend[kind].length;i++){
    var path=reqId+'/'+kind+'-'+Date.now()+'-'+rid(4)+'.jpg';
    var u=await sb.storage.from('photos').upload(path,S.pend[kind][i].blob,{contentType:'image/jpeg'});
    if(u.error)throw u.error;
    var r=await sb.from('request_photos').insert({req_no:reqId,kind:kind,path:path});
    if(r.error)throw r.error;
  }
}
function savedPhotos(kind,label){return '<div class="fld" id="sp-'+kind+'" hidden><span class="lbl">'+label+'</span><div class="thumbs"></div></div>';}
async function loadPhotos(){
  var id=S.cur;if(!id)return;
  var q=await sb.from('request_photos').select('*').eq('req_no',id).order('created_at');
  if(q.error||!q.data)return;
  for(var i=0;i<q.data.length;i++){
    var row=q.data[i],box=$('#sp-'+row.kind);if(!box)continue;
    var u=await sb.storage.from('photos').createSignedUrl(row.path,3600);
    if(u.error||!u.data)continue;
    var im=document.createElement('img');im.alt='รูปถ่าย';im.dataset.act='zoom';im.src=u.data.signedUrl;
    box.querySelector('.thumbs').appendChild(im);box.hidden=false;
  }
}

/* ---------- car form ---------- */
function paxHtml(){return S.pax.length?S.pax.map(function(p,i){return '<span class="tag">'+esc(p.name)+' · '+esc(p.dept||'-')+'<button data-act="rmPax" data-i="'+i+'" aria-label="เอาออก">×</button></span>';}).join(''):'<span class="note">ยังไม่มีผู้โดยสาร</span>';}
function lookupBox(code,id){
  var el=$(id);if(!el)return;var e=empBy(code);
  if(!code.trim()){el.className='auto';el.textContent='ชื่อ-นามสกุลและแผนกจะแสดงอัตโนมัติ';return;}
  if(!e){el.className='auto miss';el.textContent='ไม่พบรหัสนี้ในทะเบียนพนักงาน';return;}
  el.className='auto';el.textContent=e.name+' · แผนก '+(e.dept||'-');
}
function newCar(){
  S.pax=[];
  var opts=function(arr,k){return '<option value="">เลือก</option>'+arr.map(function(v){return '<option value="'+esc(v[k])+'">'+esc(v[k])+'</option>';}).join('');};
  openSheet('1. การขอใช้รถ',
   '<div class="fs"><h3>ผู้ขอใช้รถ</h3><div class="g2"><div class="fld"><label for="c-date">วันที่</label><input id="c-date" type="date" value="'+today()+'"></div><div class="fld"><label for="c-time">เวลา</label><input id="c-time" type="time" value="'+nowT()+'"></div></div>'+
   '<div class="fld"><label for="c-code">รหัสพนักงานผู้ขอใช้รถ</label><input id="c-code" list="empList" value="'+esc(S.me.code)+'" autocomplete="off" autocapitalize="characters"></div><div class="auto" id="c-who"></div></div>'+
   '<div class="fs"><h3>รายละเอียดการเดินทาง</h3><div class="fld"><label for="c-purpose">ความประสงค์ในการขอใช้รถ</label><textarea id="c-purpose"></textarea></div>'+
   '<div class="fld"><label for="c-dest">ขอใช้รถเดินทางไปยัง</label><input id="c-dest"></div></div>'+
   '<div class="fs"><h3>รายชื่อผู้โดยสาร</h3><div class="row" style="flex-wrap:nowrap"><input id="px-code" list="empList" placeholder="รหัสพนักงาน" autocomplete="off" autocapitalize="characters"><button class="btn" data-act="addPax" style="flex:none">เพิ่ม</button></div><div class="auto" id="px-who">ชื่อ-นามสกุลและแผนกจะแสดงอัตโนมัติ</div><div class="tagrow" id="paxList">'+paxHtml()+'</div></div>'+
   '<div class="fs"><h3>รถและคนขับ</h3><div class="g2"><div class="fld"><label for="c-plate">ทะเบียนรถ</label><select id="c-plate">'+opts(S.vehicles,'plate')+'</select></div>'+
   '<div class="fld"><label for="c-driver">พนักงานขับรถ</label><select id="c-driver">'+opts(S.drivers,'name')+'</select></div></div>'+
   (S.vehicles.length&&S.drivers.length?'':'<p class="note err" style="margin:0">ทะเบียนรถหรือรายชื่อพนักงานขับรถยังว่าง ให้ผู้อนุมัติเพิ่มที่เมนูทะเบียน</p>')+'</div>'+
   '<button class="btn" id="c-send" data-act="sendCar">ส่งขออนุมัติ</button>');
  lookupBox(S.me.code,'#c-who');
}
async function sendCar(){
  var f={date:$('#c-date').value,time:$('#c-time').value,code:$('#c-code').value.trim().toUpperCase(),purpose:$('#c-purpose').value.trim(),dest:$('#c-dest').value.trim(),pax:S.pax.slice(),plate:$('#c-plate').value,driver:$('#c-driver').value};
  var e=empBy(f.code);
  if(!f.date||!f.time){toast('ระบุวันที่และเวลา',true);return;}
  if(!e){toast('ไม่พบรหัสพนักงานผู้ขอใช้รถ',true);return;}
  if(!f.purpose||!f.dest){toast('กรอกความประสงค์และปลายทาง',true);return;}
  if(!f.plate||!f.driver){toast('เลือกทะเบียนรถและพนักงานขับรถ',true);return;}
  f.name=e.name;f.dept=e.dept||'';
  var no=mkNo('CAR');
  await submitReq(no,{no:no,type:'car',status:'pending',createdAt:new Date().toISOString(),by:{code:S.me.code,name:S.me.name,dept:S.me.dept||''},f:f},'#c-send');
}

/* ---------- goods form ---------- */
function syncItems(){
  var rows=document.querySelectorAll('#itBody .it-row');if(!rows.length)return;
  S.items=Array.prototype.map.call(rows,function(r){var o={};Array.prototype.forEach.call(r.querySelectorAll('[data-k]'),function(i){o[i.dataset.k]=i.value;});return o;});
}
function itemsHtml(){
  return S.items.map(function(it,i){
    return '<tr class="it-row"><td class="num" style="width:44px">'+(i+1)+'</td>'+
    '<td><input data-k="d" aria-label="รายละเอียดสิ่งของมีค่า" value="'+esc(it.d)+'"></td>'+
    '<td style="width:96px"><input data-k="w" aria-label="น้ำหนัก กิโลกรัม" type="number" min="0" step="any" inputmode="decimal" value="'+esc(it.w)+'"></td>'+
    '<td style="width:86px"><input data-k="q" aria-label="จำนวน" type="number" min="0" step="any" inputmode="decimal" value="'+esc(it.q)+'"></td>'+
    '<td style="width:110px"><select data-k="u" aria-label="หน่วยนับ">'+UNITS.map(function(u){return '<option'+(it.u===u?' selected':'')+'>'+u+'</option>';}).join('')+'</select></td>'+
    '<td style="width:130px"><input data-k="ref" aria-label="เลขที่ระบุบนสิ่งของ" value="'+esc(it.ref)+'"></td>'+
    '<td><input data-k="n" aria-label="หมายเหตุ" value="'+esc(it.n)+'"></td>'+
    '<td style="width:48px"><button class="btn bad sm" data-act="rmItem" data-i="'+i+'" aria-label="ลบรายการ">×</button></td></tr>';
  }).join('');
}
function newGoods(){
  S.items=[{d:'',w:'',q:'1',u:'ชิ้น',ref:'',n:''}];
  openSheet('2. ใบอนุญาตนำสิ่งของมีค่าเข้า-ออกบริษัท',
   '<div class="fs"><h3>ข้อมูลใบอนุญาต</h3><div class="g2"><div class="fld"><label for="g-no">เลขที่ใบอนุญาต</label><input id="g-no" value="'+mkNo('GP')+'"></div>'+
   '<div class="fld"><label for="g-dir">ขออนุญาต</label><select id="g-dir"><option value="in">นำเข้า</option><option value="out">นำออก</option></select></div>'+
   '<div class="fld"><label for="g-has">มีสิ่งของมีค่าหรือไม่</label><select id="g-has"><option value="yes">มี</option><option value="no">ไม่มี</option></select></div></div></div>'+
   '<div class="fs"><h3>ผู้ขออนุญาต</h3><div class="g2"><div class="fld"><label for="g-company">ชื่อบริษัท</label><input id="g-company"></div>'+
   '<div class="fld"><label for="g-idno">เลขที่บัตรประชาชน</label><input id="g-idno" inputmode="numeric" maxlength="13" autocomplete="off"></div>'+
   '<div class="fld"><label for="g-carrier">บรรทุกโดย</label><input id="g-carrier"></div>'+
   '<div class="fld"><label for="g-plate">หมายเลขทะเบียนรถ</label><input id="g-plate"></div></div></div>'+
   '<div class="fs"><h3>รายการสิ่งของมีค่า</h3><div class="tw"><table><thead><tr><th>ลำดับ</th><th>รายละเอียดสิ่งของมีค่า</th><th>น้ำหนัก (กก.)</th><th>จำนวน</th><th>หน่วย</th><th>เลขที่ระบุบนสิ่งของ</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="itBody">'+itemsHtml()+'</tbody></table></div><div><button class="btn ghost sm" data-act="addItem">เพิ่มรายการ</button></div></div>'+
   '<div class="fs"><div class="fld"><label for="g-purpose">วัตถุประสงค์การนำเข้า-ออก</label><textarea id="g-purpose"></textarea></div></div>'+
   '<button class="btn" id="g-send" data-act="sendGoods">ส่งขออนุมัติ</button>');
}
async function sendGoods(){
  syncItems();
  var items=S.items.filter(function(i){return i.d.trim();});
  var f={no:$('#g-no').value.trim(),dir:$('#g-dir').value,has:$('#g-has').value,company:$('#g-company').value.trim(),idno:$('#g-idno').value.trim(),carrier:$('#g-carrier').value.trim(),plate:$('#g-plate').value.trim(),items:items,purpose:$('#g-purpose').value.trim()};
  if(!f.no||!f.company){toast('กรอกเลขที่ใบอนุญาตและชื่อบริษัท',true);return;}
  if(!/^\d{13}$/.test(f.idno)){toast('เลขบัตรประชาชนต้องมี 13 หลัก',true);return;}
  if(!items.length){toast('เพิ่มรายการสิ่งของอย่างน้อย 1 รายการ',true);return;}
  if(!f.purpose){toast('กรอกวัตถุประสงค์',true);return;}
  var no=mkNo('GOODS');
  await submitReq(no,{no:no,type:'goods',status:'pending',createdAt:new Date().toISOString(),by:{code:S.me.code,name:S.me.name,dept:S.me.dept||''},f:f},'#g-send');
}
async function submitReq(id,doc,btn){
  if(S.busy)return;S.busy=true;var b=$(btn);if(b)b.disabled=true;
  var r=await sb.from('requests').insert({no:id,type:doc.type,status:'pending',created_by:doc.by.code,by_name:doc.by.name,by_dept:doc.by.dept,f:doc.f});
  if(r.error){toast(dbErr(r.error),true);if(b)b.disabled=false;}
  else{if(window.PMG_NOTIFY)window.PMG_NOTIFY('submitted',doc);closeSheet();toast('ส่งขออนุมัติแล้ว');S.tab=S.me.role==='approver'?'approve':'mine';await loadAll();}
  S.busy=false;
}
/* ---------- detail ---------- */
function dl(rows){return '<dl class="kv">'+rows.map(function(r){return '<dt>'+r[0]+'</dt><dd>'+(r[1]===''||r[1]==null?'-':r[1])+'</dd>';}).join('')+'</dl>';}
function maskId(s){s=String(s||'');return s.length>=13?s.slice(0,1)+'-'+s.slice(1,5)+'-xxxxx-'+s.slice(10,12)+'-'+s.slice(12):s;}
function guards(){return S.emps.filter(function(e){return e.role==='security';});}
function guardSel(cur){
  var g=guards(),sel=cur||(S.me.role==='security'?S.me.name:'');
  if(!g.length)return '<select id="s-guard"><option value="">ยังไม่มีรายชื่อ รปภ. ในทะเบียน</option></select>';
  return '<select id="s-guard"><option value="">เลือกชื่อ</option>'+g.map(function(e){return '<option'+(e.name===sel?' selected':'')+'>'+esc(e.name)+'</option>';}).join('')+'</select>';
}
function openDetail(id){
  var r=S.reqs.find(function(x){return x.id===id;});if(!r)return;
  S.cur=id;S.pend={out:[],'in':[]};
  var s=ST[r.status]||['',''],h='<div class="row"><span class="pill '+s[1]+'">'+s[0]+'</span><span class="note num">'+esc(r.no)+' · ส่งเมื่อ '+fmtDT(r.createdAt)+'</span></div>';
  var f=r.f;
  if(r.type==='car'){
    h+='<div class="fs">'+dl([['วันที่ เวลา',fmtD(f.date)+' '+esc(f.time)+' น.'],['ผู้ขอใช้รถ',esc(f.code)+' '+esc(f.name)+' · แผนก '+esc(f.dept||'-')],['ความประสงค์',esc(f.purpose)],['เดินทางไปยัง',esc(f.dest)],
      ['ผู้โดยสาร',(f.pax&&f.pax.length)?f.pax.map(function(p){return esc(p.name)+' ('+esc(p.dept||'-')+')';}).join('<br>'):'-'],['ทะเบียนรถ',esc(f.plate)],['พนักงานขับรถ',esc(f.driver)]])+'</div>';
  }else{
    h+='<div class="fs">'+dl([['เลขที่ใบอนุญาต',esc(f.no)],['ขออนุญาต',f.dir==='in'?'นำเข้า':'นำออก'],['สิ่งของมีค่า',f.has==='yes'?'มี':'ไม่มี'],['ผู้ขออนุญาต',esc(f.company)],['เลขบัตรประชาชน',esc(maskId(f.idno))],['บรรทุกโดย',esc(f.carrier)],['ทะเบียนรถ',esc(f.plate)],['วัตถุประสงค์',esc(f.purpose)]])+
      '<div class="tw"><table><thead><tr><th>ลำดับ</th><th>รายละเอียด</th><th>น้ำหนัก (กก.)</th><th>จำนวน</th><th>หน่วย</th><th>เลขที่ระบุบนสิ่งของ</th><th>หมายเหตุ</th></tr></thead><tbody>'+
      (f.items||[]).map(function(i,n){return '<tr><td>'+(n+1)+'</td><td>'+esc(i.d)+'</td><td class="num">'+esc(i.w||'-')+'</td><td class="num">'+esc(i.q)+'</td><td>'+esc(i.u)+'</td><td>'+esc(i.ref||'-')+'</td><td>'+esc(i.n||'-')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  }
  if(r.appr){h+='<div class="fs"><h3>ผลการอนุมัติ</h3>'+dl([['ผล',r.appr.result==='ok'?'อนุมัติ':'ไม่อนุมัติ'],['โดย',esc(r.appr.name)],['เมื่อ',fmtDT(r.appr.at)],['หมายเหตุ',esc(r.appr.note)]])+'</div>';}
  var sec=r.sec||{};
  if(r.type==='car'&&(sec.guard)){
    h+='<div class="fs"><h3>บันทึกของเจ้าหน้าที่รักษาความปลอดภัย</h3>'+dl([['เวลาออก / เลขไมล์ออก',esc(sec.outT||'-')+' น. / '+esc(sec.outKm||'-')],['เวลาเข้า / เลขไมล์เข้า',esc(sec.inT||'-')+' น. / '+esc(sec.inKm||'-')],['ระยะทาง',(sec.outKm!==''&&sec.inKm!==''&&sec.inKm!=null&&sec.outKm!=null)?(Number(sec.inKm)-Number(sec.outKm)).toLocaleString('th-TH')+' กม.':'-'],['ลงชื่อ รปภ.',esc(sec.guard)+' · '+fmtDT(sec.guardAt)]])+savedPhotos('out','รูปตอนออก')+savedPhotos('in','รูปตอนเข้า')+'</div>';
  }
  if(r.type==='goods'&&sec.guard){
    h+='<div class="fs"><h3>บันทึกของเจ้าหน้าที่รักษาความปลอดภัย</h3>'+dl([['สิ่งของถูกต้อง',sec.ok==='yes'?'ถูกต้อง':'ไม่ถูกต้อง'],['เหตุผล',sec.ok==='yes'?'-':esc(sec.reason)],['ลงชื่อ รปภ.',esc(sec.guard)],['ผู้นำของเข้า-ออก',esc(sec.carrier)],['เวลา',fmtDT(sec.at)]])+'</div>';
  }
  var role=S.me.role;
  if(role==='approver'&&r.status==='pending'){
    h+='<div class="fs"><h3>พิจารณาคำขอ</h3><div class="fld"><label for="a-note">หมายเหตุ (ถ้ามี)</label><textarea id="a-note"></textarea></div><div class="row"><button class="btn ok" data-act="appr" data-r="ok" data-id="'+esc(id)+'">อนุมัติ</button><button class="btn bad" data-act="appr" data-r="no" data-id="'+esc(id)+'">ไม่อนุมัติ</button></div></div>';
  }
  if(role==='security'&&r.type==='car'&&(r.status==='approved'||r.status==='out')){
    h+='<div class="fs"><h3>รปภ. บันทึกการออก-เข้า</h3><div class="g2">'+
      '<div class="fld"><label for="s-outT">เวลาออก</label><input id="s-outT" type="time" value="'+esc(sec.outT||'')+'"></div><div class="fld"><label for="s-outKm">เลขไมล์ออก</label><input id="s-outKm" type="number" inputmode="numeric" min="0" value="'+esc(sec.outKm||'')+'"></div>'+
      '<div class="fld"><label for="s-inT">เวลาเข้า</label><input id="s-inT" type="time" value="'+esc(sec.inT||'')+'"></div><div class="fld"><label for="s-inKm">เลขไมล์เข้า</label><input id="s-inKm" type="number" inputmode="numeric" min="0" value="'+esc(sec.inKm||'')+'"></div></div>'+
      '<div class="fld"><label for="s-guard">ลงชื่อเจ้าหน้าที่รักษาความปลอดภัย</label>'+guardSel(sec.guard)+'</div>'+
      photoBlock('out','แนบรูปตอนออก')+photoBlock('in','แนบรูปตอนเข้า')+
      '<button class="btn" id="s-save" data-act="saveCar" data-id="'+esc(id)+'">บันทึก</button><p class="note" style="margin:0">บันทึกขาออกก่อนได้ แล้วกลับมาเปิดรายการเดิมเพื่อกรอกขาเข้า รายการจะเสร็จสิ้นเมื่อมีเวลาเข้าและเลขไมล์เข้า</p></div>';
  }
  if(role==='security'&&r.type==='goods'&&r.status==='approved'){
    h+='<div class="fs"><h3>รปภ. ตรวจสิ่งของ</h3><div class="fld"><label for="s-ok">สิ่งของนำเข้า-ออกถูกต้องหรือไม่</label><select id="s-ok"><option value="yes">ถูกต้อง</option><option value="no">ไม่ถูกต้อง</option></select></div>'+
      '<div class="fld" id="s-rsn" hidden><label for="s-reason">เหตุผลที่ไม่ถูกต้อง</label><textarea id="s-reason"></textarea></div>'+
      '<div class="g2"><div class="fld"><label for="s-guard">ลงชื่อเจ้าหน้าที่รักษาความปลอดภัย</label>'+guardSel('')+'</div><div class="fld"><label for="s-carrier">ลงชื่อผู้ที่นำของเข้า-ออก</label><input id="s-carrier" value="'+esc(f.carrier||'')+'"></div></div>'+
      '<div class="fld"><label for="s-at">เวลา</label><input id="s-at" type="datetime-local" value="'+nowDT()+'"></div>'+
      '<button class="btn" id="s-save" data-act="saveGoods" data-id="'+esc(id)+'">บันทึกผลการตรวจ</button></div>';
  }
  if(role!=='security'&&(r.status==='approved'||r.status==='out'))h+='<p class="note" style="margin:0">อนุมัติแล้ว รอเจ้าหน้าที่รักษาความปลอดภัยบันทึกรายละเอียด</p>';
  openSheet(r.type==='car'?'คำขอใช้รถ':'ใบอนุญาตนำสิ่งของมีค่า',h);
  loadPhotos();
}
async function approve(id,res){
  if(S.busy)return;var note=$('#a-note').value.trim();
  if(res==='no'&&!note){toast('ระบุหมายเหตุเมื่อไม่อนุมัติ',true);return;}
  S.busy=true;
  var r=await sb.from('requests').update({status:res==='ok'?'approved':'rejected',appr:{result:res,by:S.me.code,name:S.me.name,at:new Date().toISOString(),note:note}}).eq('no',id).select('no');
  if(r.error)toast(dbErr(r.error),true);
  else if(!r.data||!r.data.length)toast('ไม่มีสิทธิ์หรือรายการนี้ถูกดำเนินการแล้ว',true);
  else{if(window.PMG_NOTIFY){var q0=S.reqs.find(function(x){return x.no===id;});if(q0)window.PMG_NOTIFY(res==='ok'?'approved':'rejected',Object.assign({},q0,{appr:{name:S.me.name}}));}toast(res==='ok'?'อนุมัติแล้ว':'บันทึกการไม่อนุมัติแล้ว');closeSheet();loadAll();}
  S.busy=false;
}
async function saveCar(id){
  if(S.busy)return;
  var sec={outT:$('#s-outT').value,outKm:$('#s-outKm').value,inT:$('#s-inT').value,inKm:$('#s-inKm').value,guard:$('#s-guard').value};
  if(!sec.guard){toast('เลือกชื่อเจ้าหน้าที่ที่ลงชื่อ',true);return;}
  if(!sec.outT||sec.outKm===''){toast('กรอกเวลาออกและเลขไมล์ออก',true);return;}
  if((sec.inT&&sec.inKm==='')||(!sec.inT&&sec.inKm!=='')){toast('กรอกเวลาเข้าและเลขไมล์เข้าให้ครบทั้งสองช่อง',true);return;}
  if(sec.inKm!==''&&Number(sec.inKm)<Number(sec.outKm)){toast('เลขไมล์เข้าต้องไม่น้อยกว่าเลขไมล์ออก',true);return;}
  S.busy=true;var b=$('#s-save');b.disabled=true;
  try{
    await upPhotos(id,'out');await upPhotos(id,'in');
    sec.guardAt=new Date().toISOString();
    var done=sec.inT&&sec.inKm!=='';
    var r=await sb.from('requests').update({sec:sec,status:done?'completed':'out'}).eq('no',id).select('no');
    if(r.error)throw r.error;
    if(!r.data||!r.data.length)throw {message:'ไม่มีสิทธิ์ทำรายการนี้'};
    if(window.PMG_NOTIFY){var q1=S.reqs.find(function(x){return x.no===id;});if(q1)window.PMG_NOTIFY(done?'done':'out',Object.assign({},q1,{sec:sec}));}
    toast(done?'บันทึกเสร็จสิ้น':'บันทึกขาออกแล้ว');closeSheet();loadAll();
  }catch(e){toast(dbErr(e),true);b.disabled=false;}
  S.busy=false;
}
async function saveGoods(id){
  if(S.busy)return;
  var sec={ok:$('#s-ok').value,reason:$('#s-reason').value.trim(),guard:$('#s-guard').value,carrier:$('#s-carrier').value.trim(),at:$('#s-at').value};
  if(sec.ok==='no'&&!sec.reason){toast('ระบุเหตุผลที่ไม่ถูกต้อง',true);return;}
  if(!sec.guard||!sec.carrier||!sec.at){toast('ลงชื่อ รปภ. ผู้นำของ และเวลาให้ครบ',true);return;}
  S.busy=true;var b=$('#s-save');b.disabled=true;
  var r=await sb.from('requests').update({sec:sec,status:'completed'}).eq('no',id).select('no');
  if(r.error){toast(dbErr(r.error),true);b.disabled=false;}
  else if(!r.data||!r.data.length){toast('ไม่มีสิทธิ์ทำรายการนี้',true);b.disabled=false;}
  else{if(window.PMG_NOTIFY){var q2=S.reqs.find(function(x){return x.no===id;});if(q2)window.PMG_NOTIFY('done',Object.assign({},q2,{sec:sec}));}toast('บันทึกผลการตรวจแล้ว');closeSheet();loadAll();}
  S.busy=false;
}
/* ---------- monthly summary ---------- */
function monthKey(r){return String((r.f&&r.f.date)||'').slice(0,7);}
function gMonth(r){var d=new Date(r.createdAt);return d.getFullYear()+'-'+pad(d.getMonth()+1);}
function rMonth(r){return r.type==='car'?monthKey(r):gMonth(r);}
function monthLabel(k){var p=k.split('-');return new Date(+p[0],+p[1]-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'});}
function monthList(){var m={};m[today().slice(0,7)]=1;S.reqs.forEach(function(r){var k=rMonth(r);if(k&&k.length===7)m[k]=1;});return Object.keys(m).sort().reverse();}
function nf(n){return Number(n).toLocaleString('th-TH',{maximumFractionDigits:1});}
function avg1(k,n){return n?Math.round(k/n*10)/10:'';}
function carRows(list,mk){return list.filter(function(r){return r.type==='car'&&(r.status==='approved'||r.status==='out'||r.status==='completed')&&monthKey(r)===mk;}).sort(function(a,b){return (a.f.date+a.f.time)<(b.f.date+b.f.time)?-1:1;});}
function kmOf(r){var s=r.sec||{};if(r.status==='completed'&&s.outKm!==''&&s.outKm!=null&&s.inKm!==''&&s.inKm!=null)return Number(s.inKm)-Number(s.outKm);return null;}
function sumData(list,mk){
  var rows=carRows(list,mk),by={};
  rows.forEach(function(r){var p=r.f.plate||'-',o=by[p]||(by[p]={plate:p,trips:0,done:0,km:0});o.trips++;var k=kmOf(r);if(k!=null){o.done++;o.km+=k;}});
  var veh=Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return b.km-a.km;});
  var t=veh.reduce(function(a,v){a.done+=v.done;a.km+=v.km;return a;},{done:0,km:0});
  return {rows:rows,veh:veh,trips:rows.length,done:t.done,km:t.km};
}
function goodsData(list,mk){
  var rows=list.filter(function(r){return r.type==='goods'&&(r.status==='approved'||r.status==='completed')&&gMonth(r)===mk;}).sort(function(a,b){return a.createdAt<b.createdAt?-1:1;});
  var by={},t={n:rows.length,'in':0,out:0,bad:0,done:0,lines:0,kg:0};
  rows.forEach(function(r){var f=r.f,c=f.company||'-',o=by[c]||(by[c]={company:c,n:0,'in':0,out:0,kg:0}),dk=f.dir==='in'?'in':'out';
    o.n++;o[dk]++;t[dk]++;if(r.status==='completed')t.done++;if(r.sec&&r.sec.ok==='no')t.bad++;
    (f.items||[]).forEach(function(i){t.lines++;var w=parseFloat(i.w);if(!isNaN(w)){o.kg+=w;t.kg+=w;}});});
  return {rows:rows,cos:Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return b.n-a.n;}),t:t};
}
function finalRecs(mk){return S.reqs.filter(function(r){return rMonth(r)===mk&&(r.status==='completed'||r.status==='rejected');});}
function archMonths(){var cur=today().slice(0,7),m={};S.reqs.forEach(function(r){var k=rMonth(r);if(k&&k<cur&&(r.status==='completed'||r.status==='rejected'))m[k]=1;});return Object.keys(m).sort().reverse();}
function vSum(){
  if(!S.month)S.month=today().slice(0,7);
  var ml=monthList();if(ml.indexOf(S.month)<0)ml.unshift(S.month);
  var h='<h2>สรุปรายเดือน</h2><div class="row"><div class="fld" style="min-width:200px"><label for="sm-month">เดือน</label><select id="sm-month">'+ml.map(function(k){return '<option value="'+k+'"'+(k===S.month?' selected':'')+'>'+esc(monthLabel(k))+'</option>';}).join('')+'</select></div><button class="btn" data-act="export" style="align-self:flex-end">ส่งออก Excel</button></div>';
  h+='<div class="chips"><button class="chip" data-act="sumMode" data-id="car" aria-pressed="'+(S.sumMode==='car')+'">การใช้รถ</button><button class="chip" data-act="sumMode" data-id="goods" aria-pressed="'+(S.sumMode==='goods')+'">สิ่งของมีค่าเข้า-ออก</button></div>';
  h+=S.sumMode==='goods'?goodsView():carView();
  if(S.me.role==='approver')h+=archView();
  return h;
}
function carView(){
  var d=sumData(S.reqs,S.month),max=Math.max.apply(null,[1].concat(d.veh.map(function(v){return v.km;})));
  var h='<div class="kpis"><div class="kpi"><b>'+d.trips+'</b><span>เที่ยวที่อนุมัติ</span></div><div class="kpi"><b>'+d.done+'</b><span>เที่ยวที่ปิดงานแล้ว</span></div><div class="kpi"><b>'+nf(d.km)+'</b><span>เลขไมล์รวม (กม.)</span></div><div class="kpi"><b>'+d.veh.length+'</b><span>คันที่ใช้งาน</span></div></div>';
  h+='<p class="note" style="margin:0">เลขไมล์นับเฉพาะเที่ยวที่ รปภ. บันทึกเวลาและเลขไมล์เข้าครบ (ไมล์เข้า − ไมล์ออก)</p>';
  if(!d.rows.length)return h+'<div class="empty">ไม่มีการใช้รถในเดือนนี้</div>';
  h+='<div class="fs sumt"><h3>สรุปตามทะเบียนรถ</h3><div class="tw"><table><thead><tr><th>ทะเบียนรถ</th><th>เที่ยว</th><th>ปิดงาน</th><th>เลขไมล์รวม (กม.)</th><th>เฉลี่ย/เที่ยว</th><th style="width:26%"></th></tr></thead><tbody>'+
    d.veh.map(function(v){return '<tr><td>'+esc(v.plate)+'</td><td class="num">'+v.trips+'</td><td class="num">'+v.done+'</td><td class="num">'+nf(v.km)+'</td><td class="num">'+(v.done?nf(v.km/v.done):'-')+'</td><td><div class="bar" style="width:'+Math.round(v.km/max*100)+'%"></div></td></tr>';}).join('')+'</tbody></table></div></div>';
  h+='<div class="fs sumt"><h3>รายการใช้รถ</h3><div class="tw"><table style="min-width:900px"><thead><tr><th>วันที่</th><th>เลขที่</th><th>ผู้ขอ</th><th>ปลายทาง</th><th>ทะเบียน</th><th>ออก</th><th>เข้า</th><th>กม.</th></tr></thead><tbody>'+
    d.rows.map(function(r){var s=r.sec||{},k=kmOf(r);return '<tr><td>'+fmtD(r.f.date)+' '+esc(r.f.time||'')+'</td><td>'+esc(r.no)+'</td><td>'+esc(r.f.name)+'<br><span class="note">'+esc(r.f.dept||'')+'</span></td><td>'+esc(r.f.dest)+'</td><td>'+esc(r.f.plate)+'</td><td class="num">'+(s.outT?esc(s.outT)+'<br>'+esc(s.outKm):'-')+'</td><td class="num">'+(s.inT?esc(s.inT)+'<br>'+esc(s.inKm):'-')+'</td><td class="num">'+(k!=null?nf(k):'-')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  return h;
}
function goodsView(){
  var d=goodsData(S.reqs,S.month),t=d.t;
  var h='<div class="kpis"><div class="kpi"><b>'+t.n+'</b><span>ใบอนุญาตที่อนุมัติ</span></div><div class="kpi"><b>'+t['in']+' / '+t.out+'</b><span>นำเข้า / นำออก</span></div><div class="kpi"><b>'+t.done+'</b><span>รปภ. ตรวจแล้ว</span></div><div class="kpi"><b>'+t.bad+'</b><span>ตรวจแล้วไม่ถูกต้อง</span></div><div class="kpi"><b>'+t.lines+'</b><span>รายการสิ่งของ</span></div><div class="kpi"><b>'+nf(t.kg)+'</b><span>น้ำหนักรวม (กก.)</span></div></div>';
  h+='<p class="note" style="margin:0">นับตามวันที่ยื่นคำขอ น้ำหนักรวมคือผลรวมของค่าที่กรอกในแต่ละรายการ</p>';
  if(!d.rows.length)return h+'<div class="empty">ไม่มีใบอนุญาตนำสิ่งของในเดือนนี้</div>';
  h+='<div class="fs sumt"><h3>สรุปตามบริษัทผู้ขออนุญาต</h3><div class="tw"><table><thead><tr><th>บริษัท</th><th>ใบอนุญาต</th><th>นำเข้า</th><th>นำออก</th><th>น้ำหนักรวม (กก.)</th></tr></thead><tbody>'+
    d.cos.map(function(c){return '<tr><td>'+esc(c.company)+'</td><td class="num">'+c.n+'</td><td class="num">'+c['in']+'</td><td class="num">'+c.out+'</td><td class="num">'+nf(c.kg)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  h+='<div class="fs sumt"><h3>รายการใบอนุญาต</h3><div class="tw"><table style="min-width:860px"><thead><tr><th>วันที่ยื่น</th><th>เลขที่ใบอนุญาต</th><th>ประเภท</th><th>บริษัท</th><th>รายการ</th><th>ผลตรวจ รปภ.</th></tr></thead><tbody>'+
    d.rows.map(function(r){var f=r.f,s=r.sec||{};return '<tr><td>'+fmtD(r.createdAt)+'</td><td>'+esc(f.no)+'<br><span class="note">'+esc(r.no)+'</span></td><td>'+(f.dir==='in'?'นำเข้า':'นำออก')+'</td><td>'+esc(f.company)+'</td><td class="num">'+(f.items||[]).length+'</td><td>'+(s.guard?(s.ok==='yes'?'ถูกต้อง':'ไม่ถูกต้อง: '+esc(s.reason)):'รอตรวจ')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  return h;
}
function archView(){
  var ms=archMonths();
  if(!S.armonth||ms.indexOf(S.armonth)<0)S.armonth=ms[0]||'';
  var h='<div class="fs"><h3>เก็บถาวรรายเดือน</h3><p class="note" style="margin:0">ดาวน์โหลดข้อมูลของเดือนที่ผ่านมาเป็นไฟล์ ZIP (Excel สรุป ข้อมูลดิบ และรูปถ่าย) เมื่อเปิดไฟล์ตรวจแล้วจึงยืนยันลบข้อมูลเดือนนั้นออกจากระบบ ลบเฉพาะรายการที่เสร็จสิ้นหรือไม่อนุมัติ รายการที่ยังค้างจะคงไว้</p>';
  if(!ms.length)h+='<div class="empty">ยังไม่มีข้อมูลของเดือนที่ผ่านมาที่ต้องเก็บถาวร</div>';
  else{
    var recs=finalRecs(S.armonth),c=recs.filter(function(r){return r.type==='car';}).length;
    h+='<div class="g2"><div class="fld"><label for="ar-month">เดือนที่จะเก็บถาวร</label><select id="ar-month">'+ms.map(function(k){return '<option value="'+k+'"'+(k===S.armonth?' selected':'')+'>'+esc(monthLabel(k))+'</option>';}).join('')+'</select></div>'+
      '<div class="fld"><span class="lbl">จำนวนที่จะเก็บ</span><div class="auto">'+recs.length+' รายการ (ใช้รถ '+c+', สิ่งของมีค่า '+(recs.length-c)+')</div></div></div>'+
      '<div class="row"><button class="btn" data-act="archDl"'+(S.busy?' disabled':'')+'>1. ดาวน์โหลด ZIP</button>';
    if(S.arch&&S.arch.saved&&S.arch.mk===S.armonth)h+='<button class="btn bad" data-act="archDel"'+(S.busy?' disabled':'')+'>'+(armed.arch?'กดอีกครั้งเพื่อลบถาวร':'2. ยืนยันลบข้อมูลเดือนนี้')+'</button>';
    h+='</div>';
  }
  if(S.archMsg)h+='<p class="note" style="margin:0" role="status"><b>'+esc(S.archMsg)+'</b></p>';
  return h+'</div>';
}
function buildWb(list,mk,all){
  var wb=XLSX.utils.book_new();
  function sh(name,rows,cols){var w=XLSX.utils.aoa_to_sheet(rows);w['!cols']=cols.map(function(x){return {wch:x};});XLSX.utils.book_append_sheet(wb,w,name);}
  var d=sumData(list,mk),a=[['สรุปการใช้รถ '+monthLabel(mk)],['บริษัท พีเอ็มจี โกลบอล จำกัด (PMG GLOBAL CO.,LTD.)'],[],['ทะเบียนรถ','จำนวนเที่ยว','เที่ยวที่ปิดงาน','เลขไมล์รวม (กม.)','เฉลี่ยต่อเที่ยว (กม.)']];
  d.veh.forEach(function(v){a.push([v.plate,v.trips,v.done,v.km,avg1(v.km,v.done)]);});
  a.push(['รวม',d.trips,d.done,d.km,avg1(d.km,d.done)]);
  sh('สรุปตามรถ',a,[24,14,16,18,20]);
  var b=[['วันที่','เวลา','เลขที่เอกสาร','รหัสผู้ขอ','ผู้ขอใช้รถ','แผนก','ความประสงค์','ปลายทาง','ผู้โดยสาร','ทะเบียนรถ','พนักงานขับรถ','เวลาออก','เลขไมล์ออก','เวลาเข้า','เลขไมล์เข้า','ระยะทาง (กม.)','สถานะ','รปภ. ผู้ลงชื่อ']];
  d.rows.forEach(function(r){var s=r.sec||{},k=kmOf(r),f=r.f;
    b.push([f.date,f.time,r.no,f.code,f.name,f.dept||'',f.purpose,f.dest,(f.pax||[]).map(function(p){return p.name;}).join(', '),f.plate,f.driver,s.outT||'',s.outKm===''||s.outKm==null?'':Number(s.outKm),s.inT||'',s.inKm===''||s.inKm==null?'':Number(s.inKm),k==null?'':k,(ST[r.status]||[''])[0],s.guard||'']);});
  sh('รายการใช้รถ',b,[12,8,20,10,22,18,28,22,28,20,20,9,12,9,12,14,14,20]);
  var g=goodsData(list,mk),t=g.t,c=[['สรุปใบอนุญาตนำสิ่งของมีค่า '+monthLabel(mk)],['บริษัท พีเอ็มจี โกลบอล จำกัด (PMG GLOBAL CO.,LTD.)'],[],['บริษัทผู้ขออนุญาต','จำนวนใบอนุญาต','นำเข้า','นำออก','น้ำหนักรวม (กก.)']];
  g.cos.forEach(function(x){c.push([x.company,x.n,x['in'],x.out,x.kg]);});
  c.push(['รวม',t.n,t['in'],t.out,t.kg]);
  sh('สรุปสิ่งของตามบริษัท',c,[30,16,10,10,18]);
  var p=[['วันที่ยื่น','เลขที่เอกสาร','เลขที่ใบอนุญาต','นำเข้า/นำออก','มีสิ่งของมีค่า','บริษัท','เลขบัตรประชาชน','บรรทุกโดย','ทะเบียนรถ','วัตถุประสงค์','ผู้ยื่นคำขอ','ผู้อนุมัติ','สถานะ','ผลตรวจ รปภ.','เหตุผลที่ไม่ถูกต้อง','รปภ. ผู้ลงชื่อ','ผู้นำของเข้า-ออก','เวลาตรวจ']],
      q=[['เลขที่เอกสาร','เลขที่ใบอนุญาต','วันที่ยื่น','นำเข้า/นำออก','บริษัท','ลำดับ','รายละเอียดสิ่งของ','น้ำหนัก (กก.)','จำนวน','หน่วย','เลขที่ระบุบนสิ่งของ','หมายเหตุ']];
  g.rows.forEach(function(r){var f=r.f,s=r.sec||{},ap=r.appr||{};
    p.push([String(r.createdAt).slice(0,10),r.no,f.no,f.dir==='in'?'นำเข้า':'นำออก',f.has==='yes'?'มี':'ไม่มี',f.company,maskId(f.idno),f.carrier,f.plate,f.purpose,r.by.name,ap.name||'',(ST[r.status]||[''])[0],s.guard?(s.ok==='yes'?'ถูกต้อง':'ไม่ถูกต้อง'):'',s.reason||'',s.guard||'',s.carrier||'',s.at||'']);
    (f.items||[]).forEach(function(i,n){var w=parseFloat(i.w),qq=parseFloat(i.q);q.push([r.no,f.no,String(r.createdAt).slice(0,10),f.dir==='in'?'นำเข้า':'นำออก',f.company,n+1,i.d,isNaN(w)?'':w,isNaN(qq)?i.q:qq,i.u,i.ref||'',i.n||'']);});});
  sh('ใบอนุญาตสิ่งของ',p,[12,20,20,12,12,24,22,18,16,28,20,20,12,14,24,20,20,18]);
  sh('รายการสิ่งของ',q,[20,20,12,12,24,8,32,12,10,10,20,24]);
  if(all){
    var z=[['เลขที่เอกสาร','ประเภท','สถานะ','ผู้ยื่นคำขอ','วันที่ยื่น','ผลการอนุมัติ','ผู้อนุมัติ','หมายเหตุการอนุมัติ']];
    list.slice().sort(function(x,y){return x.createdAt<y.createdAt?-1:1;}).forEach(function(r){var ap=r.appr||{};z.push([r.no,r.type==='car'?'ขอใช้รถ':'นำสิ่งของมีค่า',(ST[r.status]||[''])[0],r.by.name,String(r.createdAt).slice(0,10),ap.result==='ok'?'อนุมัติ':(ap.result?'ไม่อนุมัติ':''),ap.name||'',ap.note||'']);});
    sh('ทุกคำขอ',z,[22,16,14,22,12,14,22,28]);
  }
  return wb;
}
function saveBlob(name,blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);}
function chunk(a,n){var o=[];for(var i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;}
function exportXlsx(){
  if(!window.XLSX){toast('โหลดตัวสร้างไฟล์ Excel ไม่ได้ ลองรีเฟรชหน้า',true);return;}
  var buf=XLSX.write(buildWb(S.reqs,S.month,false),{type:'array',bookType:'xlsx'});
  saveBlob('PMG_summary_'+S.month+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  toast('ดาวน์โหลดไฟล์ Excel แล้ว');
}
async function archDl(){
  var mk=S.armonth;if(S.busy||!mk)return;
  if(!window.XLSX||!window.JSZip){toast('โหลดตัวสร้างไฟล์ไม่ได้ ลองรีเฟรชหน้า',true);return;}
  var recs=finalRecs(mk);if(!recs.length)return;
  S.busy=true;S.arch=null;S.archMsg='กำลังรวบรวมข้อมูลและรูปถ่าย...';renderApp();
  try{
    var nos=recs.map(function(r){return r.no;}),photos=[];
    var cs=chunk(nos,80);
    for(var c=0;c<cs.length;c++){var pq=await sb.from('request_photos').select('*').in('req_no',cs[c]);if(pq.error)throw pq.error;photos=photos.concat(pq.data||[]);}
    var zip=new JSZip(),cnt={},paths=[];
    zip.file('summary_'+mk+'.xlsx',XLSX.write(buildWb(recs,mk,true),{type:'array',bookType:'xlsx'}));
    zip.file('requests_'+mk+'.json',JSON.stringify(recs,null,1));
    for(var i=0;i<photos.length;i++){
      var p=photos[i],dl=await sb.storage.from('photos').download(p.path);if(dl.error)throw dl.error;
      var k=p.req_no+'_'+p.kind;cnt[k]=(cnt[k]||0)+1;zip.file('photos/'+k+'_'+cnt[k]+'.jpg',dl.data);paths.push(p.path);
      S.archMsg='กำลังดึงรูป '+(i+1)+'/'+photos.length;renderApp();
    }
    var blob=await zip.generateAsync({type:'blob'});
    saveBlob('PMG_archive_'+mk+'.zip',blob);
    S.arch={mk:mk,recs:recs,paths:paths,saved:true};
    S.archMsg='ดาวน์โหลดไฟล์ ZIP แล้ว ('+recs.length+' รายการ, '+photos.length+' รูป) เปิดไฟล์ตรวจให้เรียบร้อยก่อนกดลบ';
  }catch(e){S.archMsg='สร้างไฟล์ ZIP ไม่สำเร็จ ยังไม่มีการลบข้อมูล';}
  S.busy=false;renderApp();
}
async function archDel(el){
  var a=S.arch;if(!a||!a.saved||S.busy)return;
  if(!armed.arch){armed.arch=1;el.textContent='กดอีกครั้งเพื่อลบถาวร';setTimeout(function(){delete armed.arch;renderApp();},4000);return;}
  delete armed.arch;S.busy=true;S.archMsg='กำลังลบข้อมูล...';renderApp();
  try{
    var pc=chunk(a.paths,80);
    for(var i=0;i<pc.length;i++){var r=await sb.storage.from('photos').remove(pc[i]);if(r.error)throw r.error;}
    var nc=chunk(a.recs.map(function(x){return x.no;}),80);
    for(var j=0;j<nc.length;j++){var d=await sb.from('requests').delete().in('no',nc[j]);if(d.error)throw d.error;}
    S.archMsg='ลบข้อมูลเดือน'+monthLabel(a.mk)+'ออกจากระบบแล้ว ('+a.recs.length+' รายการ)';S.arch=null;
  }catch(e){S.archMsg='ลบไม่ครบ กดยืนยันลบอีกครั้งเพื่อลบส่วนที่เหลือ';}
  S.busy=false;await loadAll();renderApp();
}

/* ---------- events ---------- */
document.addEventListener('click',function(ev){
  var t=ev.target.closest('[data-act]');if(!t)return;
  var a=t.dataset.act,d=t.dataset;
  if(a==='openLine')startLogin();
  else if(a==='login')doLogin();
  else if(a==='logout')logout();
  else if(a==='closeSheet')closeSheet();
  else if(a==='tab'){S.tab=d.id;S.flt='all';renderApp();}
  else if(a==='flt'){S.flt=d.id;renderApp();}
  else if(a==='detail')openDetail(d.id);
  else if(a==='newCar')newCar();
  else if(a==='newGoods')newGoods();
  else if(a==='sendCar')sendCar();
  else if(a==='sendGoods')sendGoods();
  else if(a==='addPax'){
    var e=empBy($('#px-code').value);
    if(!e){toast('ไม่พบรหัสพนักงานนี้',true);return;}
    if(S.pax.some(function(p){return p.code===e.code;})){toast('เพิ่มแล้ว',true);return;}
    S.pax.push({code:e.code,name:e.name,dept:e.dept||''});$('#px-code').value='';lookupBox('','#px-who');$('#paxList').innerHTML=paxHtml();
  }
  else if(a==='rmPax'){S.pax.splice(+d.i,1);$('#paxList').innerHTML=paxHtml();}
  else if(a==='addItem'){syncItems();S.items.push({d:'',w:'',q:'1',u:'ชิ้น',ref:'',n:''});$('#itBody').innerHTML=itemsHtml();}
  else if(a==='rmItem'){syncItems();if(S.items.length>1)S.items.splice(+d.i,1);$('#itBody').innerHTML=itemsHtml();}
  else if(a==='appr')approve(d.id,d.r);
  else if(a==='saveCar')saveCar(d.id);
  else if(a==='saveGoods')saveGoods(d.id);
  else if(a==='zoom')t.classList.toggle('big');
  else if(a==='rmPhoto'){S.pend[d.k].splice(+d.i,1);drawPend(d.k);}
  else if(a==='empEdit')empEdit(d.id);
  else if(a==='empSave')empSave(d.id);
  else if(a==='unclaim'){sb.from('employees').update({line_user_id:null,auth_uid:null,line_name:null}).eq('code',d.id).then(function(r){if(r.error)toast(dbErr(r.error),true);else{toast('รีเซ็ตการผูก LINE แล้ว');loadAll();}});}
  else if(a==='del')delDoc(t);
  else if(a==='vehAdd')simpleAdd('เพิ่มทะเบียนรถ','<div class="fld"><label for="sa-a">ทะเบียนรถ</label><input id="sa-a"></div><div class="fld"><label for="sa-b">รายละเอียดรถ (ถ้ามี)</label><input id="sa-b"></div>','vehicles','veh');
  else if(a==='drvAdd')simpleAdd('เพิ่มพนักงานขับรถ','<div class="fld"><label for="sa-a">ชื่อ-นามสกุล</label><input id="sa-a"></div>','drivers','drv');
  else if(a==='simpleSave')simpleSave(d.col,d.mk);
  else if(a==='export')exportXlsx();
  else if(a==='sumMode'){S.sumMode=d.id;renderApp();}
  else if(a==='archDl')archDl();
  else if(a==='archDel')archDel(t);
});
document.addEventListener('input',function(ev){
  var id=ev.target.id;
  if(id==='c-code')lookupBox(ev.target.value,'#c-who');
  else if(id==='px-code')lookupBox(ev.target.value,'#px-who');
});
document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t.dataset&&t.dataset.ph)addPhotos(t.dataset.ph,t);
  else if(t.id==='sm-month'){S.month=t.value;renderApp();}
  else if(t.id==='ar-month'){S.armonth=t.value;S.arch=null;S.archMsg='';renderApp();}
  else if(t.id==='s-ok'){var b=$('#s-rsn');if(b)b.hidden=t.value!=='no';}
});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!$('#sheet').hidden)closeSheet();});

/* ---------- boot ---------- */
async function boot(){
  $('#login').hidden=false;
  if(!window.supabase||!CFG.SUPABASE_URL||/YOUR_/.test(CFG.SUPABASE_URL)||/YOUR_/.test(CFG.SUPABASE_ANON_KEY||'')){
    loginNote('ยังไม่ได้ตั้งค่า config.js (SUPABASE_URL และ SUPABASE_ANON_KEY)',true);$('#btnLine').disabled=true;return;
  }
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  try{
    var e=await myEmployee();
    if(e){S.me=e;showApp();startData();return;}
    await sb.auth.signOut();
  }catch(x){}
  loginNote();
  if(CFG.LIFF_ID&&window.liff){
    try{await liffInit();if(window.liff.isLoggedIn())handleLogin(await lineLogin('',''));}catch(x){}
  }
}
boot();
})();
