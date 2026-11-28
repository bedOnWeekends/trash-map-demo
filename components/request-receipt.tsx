import { Check, MapPin } from "lucide-react";
import {
  labels,
  stateLabels,
  timeText,
  zoneName,
  type Bin,
  type RequestRow,
} from "@/lib/model";

export function RequestReceipt({
  row,
  history = false,
  bin,
}: {
  row: RequestRow;
  history?: boolean;
  bin?: Bin;
}) {
  const milestones = [
    ["건의 접수", row.created_at],
    ["설치 승인", row.approved_at],
    ["설치 완료", row.installed_at],
  ] as const;
  return (
    <section className="request-receipt" aria-label="설치 건의 접수증">
      {!history && (
        <>
          <strong>
            <MapPin size={15} />
            {zoneName(row.zone_id)}
          </strong>
          <span>
            {row.requested_waste_types.map((t) => labels[t]).join(" · ")}
          </span>
        </>
      )}
      <p>{row.reason}</p>
      {history ? (
        <ol>
          {milestones
            .filter(([, date]) => date)
            .map(([label, date]) => (
              <li key={label}>
                <Check size={14} />
                {label}
                <time dateTime={date!}>{timeText(date!)}</time>
              </li>
            ))}
          {(row.status === "reviewing" || row.status === "rejected") && (
            <li>현재 상태 · {stateLabels[row.status]}</li>
          )}
        </ol>
      ) : (
        <small>
          {stateLabels[row.status]} ·{" "}
          <time dateTime={row.created_at}>{timeText(row.created_at)}</time>
        </small>
      )}
      {history && row.status === "installed" && bin && (
        <small>
          실제 설치 · {bin.name} ·{" "}
          {bin.waste_types.map((t) => labels[t]).join(" · ")}
        </small>
      )}
    </section>
  );
}
