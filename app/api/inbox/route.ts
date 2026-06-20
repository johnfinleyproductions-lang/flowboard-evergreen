import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const items = await prisma.inboxItem.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json();
  const schema = z.object({ text: z.string().min(1) });
  const { text } = schema.parse(body);

  const item = await prisma.inboxItem.create({ data: { text } });
  return NextResponse.json({ item });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.inboxItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
