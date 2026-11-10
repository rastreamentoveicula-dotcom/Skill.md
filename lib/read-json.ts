export class PayloadTooLargeError extends Error {}
export async function readJsonLimited(request: Request, maxBytes = 1_000_000): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new PayloadTooLargeError('Request body too large');
  if (!request.body) throw new SyntaxError('Missing request body');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done,value}=await reader.read(); if(done)break;
      size+=value.byteLength; if(size>maxBytes){await reader.cancel();throw new PayloadTooLargeError('Request body too large');}
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}
