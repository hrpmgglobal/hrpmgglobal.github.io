/* แจ้งเตือน LINE สำหรับแอป PMG เดิม — ไฟล์แยก ไม่แตะระบบล็อกอิน LINE ของแอป
   แก้ 2 ค่าข้างล่างเท่านั้น */
(function () {
  var URL = "https://yajrzamjzsribdgsohgb.supabase.co/functions/v1/line-notify";
  var KEY = "pmgglobal+123456789zxcvbnm,./asdfghjkl;'qwertyuiop[]";
  window.PMG_NOTIFY = function (event, r) {
    if (event === "out") return; // ไม่แจ้งตอนรถออก (ประหยัดโควตา LINE)
    try {
      var f = r.f || {}, s = r.sec || {}, a = r.appr || {}, form;
      if (r.type === "car") {
        form = { kind: "car", no: r.no, reqId: f.code, reqName: f.name, dest: f.dest, plate: f.plate,
          driver: f.driver, date: f.date, time: f.time, apprBy: a.name,
          out: { tOut: s.outT, mOut: s.outKm, tIn: s.inT, mIn: s.inKm } };
      } else {
        form = { kind: "goods", no: r.no, applicant: (r.by && r.by.name) || "", company: f.company,
          dir: f.dir === "in" ? "นำเข้า" : "นำออก", plate: f.plate, rows: f.items || [], apprBy: a.name,
          out: { ok: s.ok === "no" ? "ไม่ถูกต้อง" : "ถูกต้อง", why: s.reason || "" } };
      } // ไม่ส่งเลขบัตรประชาชนเข้า LINE
      fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "x-notify-key": KEY },
        body: JSON.stringify({ event: event, form: form }) }).catch(function () {});
    } catch (e) { console.warn("LINE notify failed", e); }
  };
})();
