/* ไฟล์เสริม LINE (แยกจากแอปเดิม) — ใช้ได้กับแอปที่วางบน GitHub Pages
   วิธีใช้: ใส่ 2 บรรทัดนี้ใน <head> ของแอปเดิม ก่อนสคริปต์ของแอป
   <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
   <script src="line-addon.js"></script>
*/
const LINE_CFG = {
  LIFF_ID: "2011958477-jLInZ64b",
  NOTIFY_URL: "https://yajrzamjzsribdgsohgb.supabase.co/functions/v1/line-notify",
  NOTIFY_KEY: "PMGGLOBAL+1517700122",
};

// 1) ล็อกอินด้วย LINE: หลังเสร็จ จะได้ window.LINE_USER = {userId, displayName}
//    แอปเดิมเรียก  await lineReady  เพื่อรอ แล้วใช้ LINE_USER ได้
const lineReady = (async () => {
  await liff.init({ liffId: LINE_CFG.LIFF_ID });
  if (!liff.isLoggedIn()) { liff.login(); return null; }
  const p = await liff.getProfile();
  window.LINE_USER = { userId: p.userId, displayName: p.displayName };
  return window.LINE_USER;
})();

// 2) แจ้งเตือนเข้า LINE: event = submitted | approved | rejected | done
//    form = ข้อมูลฟอร์ม เช่น {kind:'car', no:'..', reqId:'..', dest:'..', plate:'..', driver:'..'}
async function notifyLine(event, form) {
  try {
    await fetch(LINE_CFG.NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-notify-key": LINE_CFG.NOTIFY_KEY },
      body: JSON.stringify({ event, form }),
    });
  } catch (e) { console.warn("LINE notify failed", e); } // ห้ามทำให้การบันทึกของแอปเดิมล้ม
}
/* ตัวอย่างการเรียกในแอปเดิม (เพิ่มบรรทัดเดียวหลังบันทึกสำเร็จ):
   await saveForm(data);            // โค้ดเดิม
   notifyLine('submitted', data);   // เพิ่มใหม่
*/
