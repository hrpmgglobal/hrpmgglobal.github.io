// ตั้งค่าการเชื่อมต่อ (ค่าเหล่านี้เป็นค่าสาธารณะ เปิดเผยในหน้าเว็บได้)
// SUPABASE_URL / SUPABASE_ANON_KEY : Supabase > Project Settings > API
// LIFF_ID : LINE Developers > LINE Login channel > LIFF (เว้นว่างไว้เพื่อทดลองโดยยังไม่ใช้ LINE)
window.PMG_CONFIG = {
  SUPABASE_URL: "https://yajrzamjzsribdgsohgb.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhanJ6YW1qenNyaWJkZ3NvaGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTE1ODYsImV4cCI6MjEwNzE4NzU4Nn0.LzgVXaCbCHb935TyM1lj9V8viryXwAteuOebi2q9ku4",
  LIFF_ID: "2011958477-jLInZ64b"
  NOTIFY_KEY: "pmgglobal+123456789zxcvbnm,./asdfghjkl;'qwertyuiop[]"
};
window.PMG_NOTIFY = function (event, doc) {
  var C = window.PMG_CONFIG, f = doc.f || {}, s = doc.sec || {};
  var isCar = doc.type === 'car';
  var form = {
    kind: isCar ? 'car' : 'goods',
    no: isCar ? doc.no : (f.no || doc.no),
    reqName: doc.by && doc.by.name,
    reqId: doc.by && doc.by.code,
    dest: f.dest, plate: f.plate, driver: f.driver,
    date: f.date, time: f.time,
    applicant: f.carrier, company: f.company, dir: f.dir === 'in' ? 'นำเข้า' : 'นำออก',
    rows: f.items || [],
    apprBy: doc.appr && doc.appr.name,
    out: isCar
      ? { tOut: s.outT, mOut: s.outKm, tIn: s.inT || '-', mIn: s.inKm || '-' }
      : { ok: s.ok === 'yes' ? 'ถูกต้อง' : 'ไม่ถูกต้อง', why: s.reason }
  };
  fetch(C.SUPABASE_URL + 'https://yajrzamjzsribdgsohgb.supabase.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-notify-key': C.pmgglobal+123456789zxcvbnm,./asdfghjkl;'qwertyuiop[],
      'Authorization': 'Bearer ' + C.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhanJ6YW1qenNyaWJkZ3NvaGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTE1ODYsImV4cCI6MjEwNzE4NzU4Nn0.LzgVXaCbCHb935TyM1lj9V8viryXwAteuOebi2q9ku4
    },
    body: JSON.stringify({ event: event, form: form })
  }).catch(function () {});
};
