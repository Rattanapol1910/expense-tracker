export const formatThaiDate = (d: string | Date) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
