import type { DeliveryIssueReportDto } from '../api/types';

/** Concatenate issue pages in order without duplicate ids (first wins). */
export function mergeIssuePages(
  pages: Array<DeliveryIssueReportDto[] | null | undefined>,
): DeliveryIssueReportDto[] {
  const seen = new Set<number>();
  const out: DeliveryIssueReportDto[] = [];
  for (const page of pages) {
    if (!page) continue;
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
