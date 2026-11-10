import { Inbox } from "lucide-react";

/** Quiet hairline block for empty states — no dashed cards. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-white px-6 py-12 text-center">
      <Inbox className="mx-auto h-8 w-8 text-muted" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
