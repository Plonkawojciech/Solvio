// app/api/v1/convert-heic/route.ts
import { NextRequest } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';

// Funkcja do ładowania heic-convert (dynamiczny import)
async function loadHeicConvert(): Promise<((options: { buffer: Buffer; format: 'PNG' | 'JPEG'; quality?: number }) => Promise<Buffer>) | null> {
  try {
    // @ts-expect-error - heic-convert nie ma typów
    const heicConvertModule = await import('heic-convert');
    const convertFn = heicConvertModule.default || heicConvertModule;
    return convertFn as (options: { buffer: Buffer; format: 'PNG' | 'JPEG'; quality?: number }) => Promise<Buffer>;
  } catch (e) {
    console.warn('[ConvertHEIC] heic-convert not installed:', e);
    return null;
  }
}

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  // Spróbuj użyć heic-convert (jeśli zainstalowany)
  const heicConvert = await loadHeicConvert();
  if (heicConvert) {
    try {
      console.log('[ConvertHEIC] Using heic-convert for HEIC conversion...');
      const outputBuffer = await heicConvert({
        buffer: buffer,
        format: 'JPEG',
        quality: 0.9,
      });
      console.log('[ConvertHEIC] Successfully converted HEIC to JPEG using heic-convert');
      return Buffer.isBuffer(outputBuffer) 
        ? outputBuffer 
        : Buffer.from(outputBuffer);
    } catch (error) {
      console.error('[ConvertHEIC] heic-convert error:', error);
      // Fallback do sharp
    }
  }

  // Fallback: spróbuj użyć sharp (może nie działać dla HEIC)
  try {
    console.log('[ConvertHEIC] Attempting HEIC conversion with sharp...');
    const converted = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    console.log('[ConvertHEIC] Successfully converted HEIC to JPEG using sharp');
    return converted;
  } catch (error) {
    console.error('[ConvertHEIC] Sharp HEIC conversion error:', error);
    throw new Error('HEIC conversion failed. Please install heic-convert: npm install heic-convert');
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sprawdź czy to HEIC
    const heicMimeTypes = ['image/heic', 'image/heif'];
    const heicExtensions = ['.heic', '.heif', '.hif'];
    const isHeic = heicMimeTypes.includes(file.type.toLowerCase()) || 
                   heicExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isHeic) {
      // Jeśli nie HEIC, zwróć oryginalny plik
      const arrayBuffer = await file.arrayBuffer();
      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.name}"`,
        },
      });
    }

    // Konwertuj HEIC do JPEG
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const convertedBuffer = await convertHeicToJpeg(buffer);

    // Zwróć przekonwertowany plik
    const newFileName = file.name.replace(/\.(heic|heif|hif)$/i, '.jpg');
    
    return new Response(convertedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${newFileName}"`,
      },
    });
  } catch (error) {
    console.error('[ConvertHEIC] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Conversion failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
