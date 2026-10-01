import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b p-4">
        <Link href="/dashboard">ภาพรวม</Link>
        <Link href="/transactions">รายการ</Link>
        <Link href="/slips/upload">อัพโหลดสลิป</Link>
        <Link href="/transfers/pending">รอยืนยัน</Link>
        <Link href="/notifications">แจ้งเตือน</Link>
        <Link href="/settings/profile">ตั้งค่า</Link>
      </nav>
      {children}
    </div>
  );
}
