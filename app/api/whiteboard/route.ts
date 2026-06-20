import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const notes = await prisma.whiteboardNote.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ notes });
}

export async function POST() {
  const note = await prisma.whiteboardNote.create({
    data: { text: "New sticky…" },
  });
  return NextResponse.json({ note });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const schema = z.object({
    id: z.string(),
    text: z.string().optional(),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    w: z.number().int().optional(),
    h: z.number().int().optional(),
  });
  const { id, ...updates } = schema.parse(body);

  const note = await prisma.whiteboardNote.update({ where: { id }, data: updates });
  return NextResponse.json({ note });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.whiteboardNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
