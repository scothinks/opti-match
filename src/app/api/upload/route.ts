import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'No filename or file body provided.' }, { status: 400 });
  }

  // The request.body is a ReadableStream. Vercel Blob's `put` can handle this directly.
  const blob = await put(filename, request.body, {
    access: 'public',
  });

  // Return the blob details, including the URL, to the client
  return NextResponse.json(blob);
}