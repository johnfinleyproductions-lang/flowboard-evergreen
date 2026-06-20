import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limitRaw = searchParams.get("limit") ?? searchParams.get("take") ?? "50";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200);

  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const items = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const Body = z.object({
    eventType: z.string().min(1),
    entityType: z.enum(["inbox", "work", "whiteboard"]),
    entityId: z.string().min(1),
    note: z.string().min(1),
  });

  const data = Body.parse(await req.json());

  const item = await prisma.activityLog.create({ data });
  return NextResponse.json({ item });
}
