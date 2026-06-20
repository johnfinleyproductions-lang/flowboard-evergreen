import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const items = await prisma.workItem.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json();
  const schema = z.object({
    kind: z.enum(["task", "project"]),
    title: z.string().min(1),
    status: z.enum(["backlog", "next", "now", "waiting", "done"]).default("backlog"),
    outcome: z.string().optional().nullable(),
    nextAction: z.string().optional().nullable(),
  });
  const data = schema.parse(body);

  const item = await prisma.workItem.create({ data });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const schema = z.object({
    id: z.string().min(1),
    status: z.enum(["backlog", "next", "now", "waiting", "done"]).optional(),
    outcome: z.string().optional().nullable(),
    nextAction: z.string().optional().nullable(),
    title: z.string().optional(),
  });
  const { id, ...updates } = schema.parse(body);

  const item = await prisma.workItem.update({ where: { id }, data: updates });
  return NextResponse.json({ item });
}
