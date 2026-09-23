import { OrderResponse } from "@passform/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderView } from "@/components/orders/OrderView";
import { ApiError, apiFetch } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${(await params).id}` };
}

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  let order: OrderResponse;
  try {
    order = await apiFetch(`/orders/${encodeURIComponent(id)}`, OrderResponse);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return <OrderView initial={order} />;
}
