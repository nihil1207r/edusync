"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, Pill, Button, LoadingState } from "@/components/ui";
import type { Fee, FeePayment } from "@/lib/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function FeesTab() {
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await apiGet<{ success: boolean; fees: Fee[]; payments: FeePayment[]; message?: string }>("/api/fees");
    if (res.success) {
      setFees(res.fees);
      setPayments(res.payments);
    } else {
      setFees([]);
      setError(res.message || "Could not load fees.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function pay(fee: Fee) {
    setError("");
    setPayingId(fee.id);
    const res = await apiPost<{ success: boolean; message?: string; orderId?: string; amount?: number; currency?: string; keyId?: string }>(
      "/api/fees/razorpay/order",
      { feeId: fee.id }
    );
    if (!res.success || !res.orderId) {
      setError(res.message || "Could not start payment.");
      setPayingId(null);
      return;
    }

    if (typeof window === "undefined" || !window.Razorpay) {
      setError("Razorpay checkout script isn't loaded. Add the checkout.js script tag to use live payment.");
      setPayingId(null);
      return;
    }

    const rzp = new window.Razorpay({
      key: res.keyId,
      amount: res.amount,
      currency: res.currency,
      order_id: res.orderId,
      name: "EduNexus",
      description: `${fee.term} fees`,
      handler: () => refresh(),
    });
    rzp.open();
    setPayingId(null);
  }

  if (!fees) return <LoadingState />;

  return (
    <div>
      {error && <p className="text-sm text-brick mb-4">{error}</p>}
      <div className="space-y-2 mb-8">
        {fees.length === 0 && <p className="text-sm text-ink-soft">No fee items on record.</p>}
        {fees.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{f.term}</p>
                <p className="text-sm text-ink-soft">
                  ₹{f.amount.toLocaleString("en-IN")} · due {new Date(f.due_date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={f.status === "paid" ? "leaf" : f.status === "overdue" ? "brick" : "accent"}>{f.status}</Pill>
                {f.status !== "paid" && (
                  <Button onClick={() => pay(f)} disabled={payingId === f.id}>
                    {payingId === f.id ? "Starting…" : "Pay now"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {payments.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">Payment history</p>
          <div className="space-y-1">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-paper-raised border border-line rounded px-4 py-2 text-sm">
                <span className="text-ink">₹{p.amount.toLocaleString("en-IN")} {p.method ? `via ${p.method}` : ""}</span>
                <Pill tone={p.verified ? "leaf" : "accent"}>{p.verified ? "verified" : "pending"}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
