'use client';

import * as React from 'react';
import { UploadCloud, X, Loader2, AlertCircle, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { t, getLanguage } from '@/lib/i18n';

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
  receipt_id?: string;
  ocrText?: string;
  parsed?: {
    vendor?: string | null;
    date?: string | null;
    total?: string | null;
    currency?: string | null;
  };
  provider?: string;
  warnings?: string[];
  // Nowy format dla wielu plików
  files_processed?: number;
  files_succeeded?: number;
  files_failed?: number;
  results?: Array<{
    file: string;
    success: boolean;
    receipt_id?: string;
    error?: string;
    message?: string;
    data?: any;
  }>;
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
  const [progress, setProgress] = React.useState<{ uploaded: number; total: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = e.target.files;
      setFiles((prev) => [...prev, ...Array.from(fileList)]);
    }
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const resetState = () => {
    setFiles([]);
    setErrorMsg(null);
    setIsUploading(false);
    setIsProcessing(false);
    setProgress(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (files.length === 0) {
      setErrorMsg(getLanguage() === 'pl' ? 'Dodaj przynajmniej jeden plik.' : 'Add at least one file.');
      return;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ScanReceipt] auth error:', userErr);
      }
      setErrorMsg(getLanguage() === 'pl' ? 'Musisz być zalogowany.' : 'You must be logged in.');
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
      if (!receipt) {
        throw new Error('Failed to create receipt');
      }
      const receiptId = receipt.id as string;

      // 2) Upload do Storage (konwertuj HEIC bo Supabase Storage nie wspiera HEIC)
      setProgress({ uploaded: 0, total: files.length });

      const uploadResults = await Promise.allSettled(
        files.map(async (file, index) => {
          // Sprawdź czy to HEIC
          const isHeic = file.type.includes('heic') || file.type.includes('heif') || 
                         file.name.toLowerCase().match(/\.(heic|heif)$/);
          
          let fileToUpload = file;
          let uploadFileName = file.name;
          
          // Jeśli HEIC, konwertuj do JPEG dla Supabase Storage
          if (isHeic) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const response = await fetch('/api/v1/convert-heic', {
                method: 'POST',
                body: (() => {
                  const fd = new FormData();
                  fd.append('file', new Blob([arrayBuffer], { type: file.type }), file.name);
                  return fd;
                })(),
              });
              
              if (response.ok) {
                const blob = await response.blob();
                uploadFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
                fileToUpload = new File([blob], uploadFileName, { type: 'image/jpeg' });
              }
            } catch (err) {
              console.warn('[ScanReceipt] HEIC conversion for storage failed, using original');
            }
          }

          const path = `${user.id}/${receiptId}/${uploadFileName}`;

          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(path, fileToUpload, {
              upsert: true,
              contentType: fileToUpload.type || 'image/jpeg',
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

          setProgress((prev) => prev ? { ...prev, uploaded: prev.uploaded + 1 } : null);
          return { path, publicUrl };
        })
      );

      // Sprawdź czy wszystkie uploady się powiodły
      const failedUploads = uploadResults.filter(r => r.status === 'rejected');
      if (failedUploads.length > 0) {
        const firstError = failedUploads[0];
        if (firstError.status === 'rejected') {
          throw firstError.reason;
        }
      }
      setProgress(null);

      setIsUploading(false);
      setIsProcessing(true);

      // 3) OCR — wyślij pliki + metadane (Mindee akceptuje HEIC)
      const fd = new FormData();
      fd.append('receiptId', receiptId);
      fd.append('userId', user.id);
      for (const f of files) fd.append('files', f, f.name);

      const res = await fetch('/api/v1/ocr-receipt', {
        method: 'POST',
        body: fd,
      });
      
      // Najpierw pobierz response jako text
      const responseText = await res.text();
      
      if (!res.ok) {
        let errorMsg = 'OCR zwrócił błąd.';
        try {
          const errorData = JSON.parse(responseText);
          
          // Sprawdź czy to duplikat
          if (errorData.error === 'duplicate') {
            errorMsg = `⚠️ Ten paragon został już wgrany!\n\n${errorData.message || 'Duplikat wykryty.'}`;
            toast.warning('Duplikat paragonu', {
              description: errorData.message || 'Ten paragon został już wcześniej dodany.',
              duration: 5000,
            });
          } else {
            errorMsg = errorData.message || errorData.error || errorMsg;
          }
          
          if (process.env.NODE_ENV === 'development') {
            console.error('[ScanReceipt] OCR HTTP error:', res.status, errorData);
          }
        } catch {
          errorMsg = responseText || errorMsg;
          if (process.env.NODE_ENV === 'development') {
            console.error('[ScanReceipt] OCR HTTP error:', res.status, responseText);
          }
        }
        throw new Error(errorMsg);
      }

      // Parsuj JSON tylko jeśli response był OK
      let parsed: OcrResult;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ScanReceipt] JSON parse error:', parseError);
          console.error('[ScanReceipt] Response text:', responseText.substring(0, 500));
        }
        throw new Error('Otrzymano nieprawidłową odpowiedź z serwera. Sprawdź logi.');
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ScanReceipt] OCR result:', parsed);
      }
      
      // Sprawdź czy są ostrzeżenia
      if (parsed.warnings && parsed.warnings.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ScanReceipt] OCR warnings:', parsed.warnings);
        }
      }

      // Obsługa wielu plików
      if (parsed.results && Array.isArray(parsed.results)) {
        const successCount = parsed.files_succeeded || 0;
        const totalCount = parsed.files_processed || parsed.results.length;
        const duplicateCount = parsed.results.filter(r => r.error === 'duplicate').length;
        
        if (successCount === totalCount) {
          toast.success(`Zakończono skanowanie`, {
            description: `Przetworzono ${successCount} paragon${successCount > 1 ? 'ów' : ''}.`,
          });
        } else if (successCount > 0) {
          const isPl = getLanguage() === 'pl'
          let desc = isPl 
            ? `Przetworzono ${successCount}/${totalCount} paragonów.`
            : `Processed ${successCount}/${totalCount} receipts.`;
          if (duplicateCount > 0) {
            desc += isPl
              ? ` ${duplicateCount} duplikat${duplicateCount > 1 ? 'ów' : ''} pominięto.`
              : ` ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} skipped.`;
          }
          toast.warning(t('receipts.partialSuccess'), {
            description: desc,
          });
        } else {
          // Wszystkie błędy - sprawdź czy to duplikaty
          if (duplicateCount === totalCount) {
            toast.warning(t('receipts.duplicate'), {
              description: t('receipts.allDuplicates'),
            });
          } else {
            toast.error(t('receipts.error'), {
              description: getLanguage() === 'pl' ? 'Nie udało się przetworzyć żadnego paragonu.' : 'Failed to process any receipts.',
            });
          }
        }
      } else {
        toast.success(t('receipts.completed'), {
          description: t('receipts.completedDesc'),
        });
      }

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
            {getLanguage() === 'pl' ? 'Nowy skan paragonu' : 'New Receipt Scan'}
          </SheetTitle>
          <SheetDescription>
            {getLanguage() === 'pl' ? 'Dodaj zdjęcia paragonu. System odczyta dane przez OCR.' : 'Add receipt images. The system will read data via OCR.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form
            id="scan-receipt-form"
            onSubmit={onSubmit}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="file-upload">{t('receipts.addFile')}</Label>
              <label
                htmlFor="file-upload"
                className={cn(
                  'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-8 transition-colors hover:bg-muted/50',
                  isBusy && 'cursor-not-allowed opacity-50'
                )}
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="mt-1 text-sm text-muted-foreground">
                  {getLanguage() === 'pl' ? (
                    <>
                      <span className="font-semibold text-primary">Wgraj</span> lub przeciągnij pliki
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-primary">Upload</span> or drag files
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('receipts.selectFiles')} ({t('receipts.maxSize')})
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

            {progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t('receipts.uploading')}</span>
                  <span>{progress.uploaded} / {progress.total}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(progress.uploaded / progress.total) * 100}%` }}
                  />
                </div>
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
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="scan-receipt-form" disabled={isBusy}>
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading
              ? t('receipts.uploading')
              : isProcessing
              ? t('receipts.processing')
              : t('receipts.scan')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
