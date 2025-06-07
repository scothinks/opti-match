import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

// This route no longer needs the Edge runtime, it can be a standard Serverless Function.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        // This is where you can add validation, e.g., for file type, size, or user authentication.
        return {
          allowedContentTypes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
          tokenPayload: JSON.stringify({
            // Optional: pass any custom metadata to the onUploadCompleted callback
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // You can perform any side-effects here, like saving the blob details to your database.
        console.log('Blob upload completed', blob, tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }, // The webhook will return 400 for invalid requests
    );
  }
}