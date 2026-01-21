'use client';

import * as React from 'react';
import { UploadCloud, X, Loader2, AlertCircle, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OcrResult = {
  receipt_id: string;
  ocrText?: string;
  parsed?: {
    vendor?: string | null;
    date?: string | null;
    total?: string | null;
    currency?: string | null;
  };
  provider?: string;
  warnings?: string[];
};

interface ScanReceiptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed?: (result: OcrResult | null) => void;
}

export function ScanReceiptSheet({
  isOpen,
  onClose,
  onParsed,
}: ScanReceiptSheetProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const [files, setFiles] = React.useState<File[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files)
      setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const resetState = () => {
    setFiles([]);
    setErrorMsg(null);
    setIsUploading(false);
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg('Dodaj przynajmniej jeden plik.');
      return;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ScanReceipt] auth error:', userErr);
      }
      setErrorMsg('Musisz być zalogowany.');
      return;
    }
    const user = userData.user;

    try {
      setIsUploading(true);

      // Validate file sizes (max 10MB per file)
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      for (const file of files) {
        if (file.size > maxFileSize) {
          throw new Error(`File ${file.name} is too large. Maximum size is 10MB.`);
        }
      }

      // 1) rekord w receipts
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert([{ user_id: user.id }])
        .select()
        .single();

      if (receiptError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ScanReceipt] receipts insert error:', receiptError);
        }
        throw receiptError;
      }
      const receiptId = receipt.id as string;

      // 2) upload do Storage + zapis linków
      for (const file of files) {
        const path = `${user.id}/${receiptId}/${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, file, {
            upsert: true,
            contentType: file.type || undefined,
          });

        if (uploadError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[ScanReceipt] storage upload error:', uploadError);
          }
          throw uploadError;
        }

        const { data: pub } = supabase.storage
          .from('receipts')
          .getPublicUrl(path);
        const publicUrl = pub.publicUrl;

        const { error: imgErr } = await supabase
          .from('receipt_images')
          .insert([{ receipt_id: receiptId, image_url: publicUrl }]);

        if (imgErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[ScanReceipt] receipt_images insert error:', imgErr);
          }
          throw imgErr;
        }
      }

      setIsUploading(false);
      setIsProcessing(true);

      // 3) OCR — wyślij realne pliki + metadane
      const fd = new FormData();
      fd.append('receiptId', receiptId);
      fd.append('userId', user.id);
      for (const f of files) fd.append('files', f, f.name);

      const res = await fetch('/api/v1/ocr-receipt', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const msg = await res.text();
        if (process.env.NODE_ENV === 'development') {
          console.error('[ScanReceipt] OCR HTTP error:', res.status, msg);
        }
        throw new Error(msg || 'OCR zwrócił błąd.');
      }

      const parsed: OcrResult = await res.json();

      toast.success('Zakończono skanowanie', {
        description: 'Dane z paragonu zostały odczytane.',
      });

      onParsed?.(parsed ?? { receipt_id: receiptId });
      resetState();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Błąd podczas skanowania.';
      if (process.env.NODE_ENV === 'development') {
        console.error('[ScanReceipt] catch:', err);
      }
      setErrorMsg(msg);
      toast.error('Błąd', { description: msg });
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const isBusy = isUploading || isProcessing;

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-xl font-semibold">
            Nowy skan paragonu
          </SheetTitle>
          <SheetDescription>
            Dodaj zdjęcia paragonu. System odczyta dane przez OCR.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form
            id="scan-receipt-form"
            onSubmit={onSubmit}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="file-upload">Załącz pliki</Label>
              <label
                htmlFor="file-upload"
                className={cn(
                  'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-8 transition-colors hover:bg-muted/50',
                  isBusy && 'cursor-not-allowed opacity-50'
                )}
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-primary">Wgraj</span> lub
                  przeciągnij pliki
                </p>
                <Input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/png, image/jpeg, image/webp, image/heic, application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />
              </label>

              {files.length > 0 && (
                <div className="space-y-2 pt-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm truncate">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {file.name}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFile(index)}
                        disabled={isBusy}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{errorMsg}</span>
              </div>
            )}
          </form>
        </div>

        <SheetFooter className="mt-auto border-t p-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isBusy}
          >
            Anuluj
          </Button>
          <Button type="submit" form="scan-receipt-form" disabled={isBusy}>
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading
              ? 'Wgrywanie…'
              : isProcessing
              ? 'Przetwarzanie OCR…'
              : 'Skanuj'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
