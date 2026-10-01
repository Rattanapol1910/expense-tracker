# Expense Tracker

เว็บบันทึกรายรับรายจ่าย: อัพโหลดสลิป, เพิ่มรายการเอง, ล็อกอินด้วย Passkey/สแกนหน้า,
และจับคู่รายการโอนระหว่างผู้ใช้ (ผู้โอน = รายจ่าย / ผู้รับ = รายรับ)

## เริ่มต้น
```bash
npm install
cp .env.example .env.local   # ใส่คีย์ Supabase และ API ตรวจสลิป
npm run dev
```

## ตั้งค่า Supabase
รันไฟล์ใน `supabase/migrations/` ตามลำดับ 001 → 004 (SQL Editor หรือ `supabase db push`)

## ลำดับการพัฒนา
1. เฟส 1: auth, transactions, dashboard
2. เฟส 2: slips (upload + parse)
3. เฟส 3: transfers (จับคู่ + ยืนยัน), bank-accounts
4. เฟส 4: notifications, รายงาน

> ถ้าใช้ Passkey อย่างเดียว ลบ `api/auth/face`, `FaceScanner.tsx`, `lib/auth/face.ts`, `hooks/useCamera.ts` ได้
