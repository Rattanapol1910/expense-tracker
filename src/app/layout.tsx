import "./globals.css";

export const metadata = { title: "Expense Tracker", description: "บันทึกรายรับรายจ่าย" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
