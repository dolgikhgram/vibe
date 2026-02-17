import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import os from "os";
import { uploadToSoundCloud } from "@/lib/soundcloud-uploader";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_MIME = ["audio/mpeg", "audio/mp3"];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME.includes(file.type) && !file.name.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json(
        { success: false, error: "Only MP3 files are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const tempDir = os.tmpdir();
    const tempPath = path.join(
      tempDir,
      `soundcloud-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
    );

    const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
    const writeStream = createWriteStream(tempPath);
    await pipeline(nodeStream, writeStream);

    try {
      const result = await uploadToSoundCloud({
        filePath: tempPath,
        title: title || undefined,
      });
      return NextResponse.json(result);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
