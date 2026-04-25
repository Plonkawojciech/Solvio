'use client';

import * as React from 'react';
import {
  UploadCloud,
  X,
  Loader2,
  AlertCircle,
  FileText,
  ImageIcon,
  RefreshCcw,
  CheckCircle2,
  ScanLine,
  Cpu,
  Edit2,
  Check,
  Tag,
  ExternalLink,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AiEnrichmentItem = {
  index: number;
  suggestedCategory: string;
  confidence: number;
};

type AiEnrichment = {
  items?: AiEnrichmentItem[];
  vendor?: string;
  receiptType?: string;
  tags?: string[];
};

type ParsedItem = {
  name: string;
  nameTranslated?: string | null;
  quantity?: number | null;
  price?: number | null;
  category_id?: string | null;
  suggestedCategory?: string;
  confidence?: number;
};

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
  // Multi-file format
  files_processed?: number;
  files_succeeded?: number;
  files_failed?: number;
  results?: Array<{
    file: string;
    success: boolean;
    receipt_id?: string;
    error?: string;
    message?: string;
    data?: {
      merchant?: string;
      total?: number;
      currency?: string;
      date?: string;
      exchangeRate?: number | null;
      detectedLanguage?: string | null;
      items?: Array<{ name: string; nameTranslated?: string | null; quantity?: number | null; price?: number | null; category_id?: string | null }>;
      aiEnrichment?: AiEnrichment;
    };
  }>;
};

interface ScanReceiptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed?: (result: OcrResult | null) => void;
  categories?: Array<{ id: string; name: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', CZK: 'Kč',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', HUF: 'Ft', RON: 'lei',
  PLN: 'zł',
};

function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
}

function isHeicFile(file: File) {
  return (
    file.type.includes('heic') ||
    file.type.includes('heif') ||
    !!file.name.toLowerCase().match(/\.(heic|heif)$/)
  );
}

function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    !!file.name.toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/)
  );
}

async function convertHeicToJpegFile(file: File): Promise<File> {
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
    if (!response.ok) return file;
    const blob = await response.blob();
    const uploadFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], uploadFileName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

async function normalizeImageOrientation(file: File): Promise<File> {
  try {
    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const normalizedFile = new File(
          [blob],
          file.name.replace(/\.(png|webp|heic|heif)$/i, '.jpg'),
          { type: 'image/jpeg' }
        );
        resolve(normalizedFile);
      }, 'image/jpeg', 0.92);
    });
  } catch (error) {
    console.warn('[normalizeImageOrientation] Failed, using original:', error);
    return file;
  }
}

async function compressImageToTarget(
  file: File,
  targetBytes: number,
  options?: { maxDim?: number }
): Promise<File> {
  if (file.size <= targetBytes) {
    return normalizeImageOrientation(file);
  }
  try {
    let img: ImageBitmap;
    try {
      img = await createImageBitmap(file);
    } catch {
      const url = URL.createObjectURL(file);
      const imgEl = new Image();
      await new Promise((resolve, reject) => {
        imgEl.onload = () => resolve(null);
        imgEl.onerror = reject;
        imgEl.src = url;
      });
      img = await createImageBitmap(imgEl);
      URL.revokeObjectURL(url);
    }
    const maxDim = options?.maxDim ?? 2000;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    let w = Math.max(1, Math.round(img.width * scale));
    let h = Math.max(1, Math.round(img.height * scale));
    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const tryEncode = (quality: number) =>
      new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
    let bestBlob: Blob | null = null;
    for (const q of [0.85, 0.78, 0.72, 0.66, 0.6, 0.55]) {
      const blob = await tryEncode(q);
      if (!blob) continue;
      bestBlob = blob;
      if (blob.size <= targetBytes) break;
    }
    let safety = 0;
    while (bestBlob && bestBlob.size > targetBytes && Math.max(w, h) > 900 && safety < 4) {
      safety++;
      w = Math.max(1, Math.round(w * 0.85));
      h = Math.max(1, Math.round(h * 0.85));
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx2 = canvas.getContext('2d');
      if (!ctx2) break;
      ctx2.drawImage(img, 0, 0, w, h);
      const blob = await tryEncode(0.72);
      if (!blob) break;
      bestBlob = blob;
    }
    if (!bestBlob || bestBlob.size === 0) return file;
    const outName = file.name.replace(/\.(png|webp|jpe?g|heic|heif)$/i, '.jpg');
    const compressedFile = new File([bestBlob], outName, { type: 'image/jpeg' });
    if (compressedFile.size === 0) return file;
    return compressedFile;
  } catch (error) {
    console.warn('[compressImageToTarget] Failed, using original:', error);
    return file;
  }
}

// ─── Image Thumbnail Component ────────────────────────────────────────────────

function FileThumbnail({ file }: { file: File }) {
  const [src, setSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isImageFile(file) || isHeicFile(file)) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) {
    return (
      <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={file.name}
      className="h-10 w-10 rounded border object-cover shrink-0"
    />
  );
}

// ─── Scanning Progress Indicator ─────────────────────────────────────────────

type ScanStep = 'compressing' | 'uploading' | 'scanning' | 'categorizing';

function ScanProgress({ step }: { step: ScanStep | null }) {
  const isPl = getLanguage() === 'pl';

  const steps: { id: ScanStep; labelPl: string; labelEn: string; icon: React.ReactNode }[] = [
    {
      id: 'compressing',
      labelPl: 'Optymalizacja obrazu',
      labelEn: 'Optimising image',
      icon: <ImageIcon className="h-4 w-4" />,
    },
    {
      id: 'uploading',
      labelPl: 'Przesyłanie pliku',
      labelEn: 'Uploading file',
      icon: <UploadCloud className="h-4 w-4" />,
    },
    {
      id: 'scanning',
      labelPl: 'Skanowanie OCR',
      labelEn: 'OCR scanning',
      icon: <ScanLine className="h-4 w-4" />,
    },
    {
      id: 'categorizing',
      labelPl: 'Kategoryzacja AI',
      labelEn: 'AI categorisation',
      icon: <Cpu className="h-4 w-4" />,
    },
  ];

  const currentIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {steps.map((s, idx) => {
        const isDone = currentIndex > idx;
        const isActive = currentIndex === idx;
        const isPending = currentIndex < idx;
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors duration-300',
                isDone && 'border-green-500 bg-green-500/10 text-green-600',
                isActive && 'border-primary bg-primary/10 text-primary animate-pulse',
                isPending && 'border-muted-foreground/30 bg-muted text-muted-foreground/40'
              )}
            >
              {isDone ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                s.icon
              )}
            </div>
            <span
              className={cn(
                'text-sm transition-colors duration-300',
                isDone && 'text-green-600',
                isActive && 'font-medium text-foreground',
                isPending && 'text-muted-foreground/50'
              )}
            >
              {isPl ? s.labelPl : s.labelEn}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScanReceiptSheet({
  isOpen,
  onClose,
  onParsed,
  categories: categoriesProp = [],
}: ScanReceiptSheetProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [isBusy, setIsBusy] = React.useState(false);
  const [scanStep, setScanStep] = React.useState<ScanStep | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const dropRef = React.useRef<HTMLLabelElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const autoScanTriggered = React.useRef(false);

  // Self-fetch categories + account currency when prop is empty
  const [fetchedCategories, setFetchedCategories] = React.useState<Array<{ id: string; name: string }>>([]);
  const [accountCurrency, setAccountCurrency] = React.useState('PLN');
  React.useEffect(() => {
    if (!isOpen) return;
    fetch('/api/data/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.categories && categoriesProp.length === 0) setFetchedCategories(data.categories);
        if (data?.settings?.currency) setAccountCurrency(data.settings.currency.toUpperCase());
      })
      .catch((err) => console.error('Failed to fetch settings:', err));
  }, [isOpen, categoriesProp.length]);
  const categories = categoriesProp.length > 0 ? categoriesProp : fetchedCategories;

  // Review step state
  const [reviewItems, setReviewItems] = React.useState<ParsedItem[]>([]);
  const [reviewMeta, setReviewMeta] = React.useState<{
    merchant?: string;
    total?: number;
    currency?: string;
    date?: string;
    exchangeRate?: number | null;
    detectedLanguage?: string | null;
    receiptId?: string;
    ocrResult?: OcrResult;
  } | null>(null);
  const [isReviewing, setIsReviewing] = React.useState(false);
  const [editingReviewIndex, setEditingReviewIndex] = React.useState<number | null>(null);
  const [editReviewName, setEditReviewName] = React.useState('');
  const [editReviewCategory, setEditReviewCategory] = React.useState('');
  const [editReviewPrice, setEditReviewPrice] = React.useState('');
  const [editReviewQuantity, setEditReviewQuantity] = React.useState('');

  const isPl = getLanguage() === 'pl';

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const deduped = arr.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...deduped];
    });
    setErrorMsg(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      setErrorMsg(null);
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
        const deduped = incoming.filter((f) => !existing.has(`${f.name}-${f.size}`));
        const merged = [...prev, ...deduped];
        // Auto-start scan after state update using merged files directly
        if (merged.length > 0 && !autoScanTriggered.current) {
          autoScanTriggered.current = true;
          // Use setTimeout to ensure state flush before triggering scan
          setTimeout(() => {
            autoScanTriggered.current = false;
            runScan(merged);
          }, 0);
        }
        return merged;
      });
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isBusy) return;
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // ── Reset / close ──────────────────────────────────────────────────────────

  const resetState = () => {
    setFiles([]);
    setErrorMsg(null);
    setIsBusy(false);
    setScanStep(null);
    setReviewItems([]);
    setReviewMeta(null);
    setIsReviewing(false);
    setEditingReviewIndex(null);
  };

  const handleClose = () => {
    if (isBusy) return; // prevent accidental close during scan
    resetState();
    onClose();
  };

  // ── Core scan logic (accepts files directly to avoid stale-closure issues) ──

  const runScan = async (filesToScan: File[]) => {
    setErrorMsg(null);

    if (filesToScan.length === 0) {
      setErrorMsg(t('receipts.addFileFirst'));
      return;
    }

    setIsBusy(true);

    try {
      // Step 1 — compress / optimise
      setScanStep('compressing');

      const perFileTarget =
        filesToScan.length <= 1
          ? 1200 * 1024
          : filesToScan.length === 2
            ? 800 * 1024
            : filesToScan.length === 3
              ? 650 * 1024
              : 500 * 1024;

      const optimizedForOcr: File[] = [];
      for (const original of filesToScan) {
        if (original.type === 'application/pdf' && original.size > perFileTarget) {
          throw new Error(
            isPl
              ? `PDF ${original.name} jest za duży. Spróbuj zdjęcie albo mniejszy PDF.`
              : `PDF ${original.name} is too large. Try a photo or a smaller PDF.`
          );
        }

        if (!isImageFile(original)) {
          optimizedForOcr.push(original);
          continue;
        }

        let f = original;
        if (isHeicFile(f)) f = await convertHeicToJpegFile(f);
        f = await normalizeImageOrientation(f);
        if (f.size > perFileTarget) f = await compressImageToTarget(f, perFileTarget, { maxDim: 2000 });

        if (!f.type || f.type === 'application/octet-stream') {
          const ext = f.name.toLowerCase();
          if (ext.match(/\.(jpg|jpeg)$/)) f = new File([f], f.name, { type: 'image/jpeg' });
          else if (ext.match(/\.png$/)) f = new File([f], f.name, { type: 'image/png' });
          else if (ext.match(/\.webp$/)) f = new File([f], f.name, { type: 'image/webp' });
          else f = new File([f], f.name, { type: 'image/jpeg' });
        }

        optimizedForOcr.push(f);
      }

      // Step 2 — upload
      setScanStep('uploading');

      const fd = new FormData();
      for (const f of optimizedForOcr) fd.append('files', f, f.name);

      // Step 3 — OCR scanning
      setScanStep('scanning');

      const res = await fetch('/api/v1/ocr-receipt', {
        method: 'POST',
        body: fd,
      });

      const responseText = await res.text();

      if (!res.ok) {
        let msg = t('receipts.ocrError');

        if (res.status === 413) {
          msg = isPl
            ? 'Plik jest za duży (limit serwera). Spróbuj 1 plik naraz lub zrób zdjęcie bliżej paragonu.'
            : 'File is too large (server limit). Try 1 file at a time or take a closer photo of the receipt.';
          toast.error(t('receipts.requestTooLarge'), { description: msg, duration: 7000 });
          throw new Error(msg);
        }

        if (res.status === 400) {
          msg = isPl
            ? 'Nieprawidłowy format pliku. Użyj JPG, PNG, HEIC lub PDF.'
            : 'Invalid file format. Use JPG, PNG, HEIC or PDF.';
          toast.error(t('receipts.formatError'), { description: msg, duration: 5000 });
          throw new Error(msg);
        }

        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error === 'duplicate') {
            msg = isPl
              ? `Ten paragon został już wgrany! ${errorData.message || ''}`
              : `This receipt was already uploaded! ${errorData.message || ''}`;
            toast.warning(t('receipts.duplicateReceipt'), {
              description: errorData.message || t('receipts.duplicateReceiptDesc'),
              duration: 5000,
            });
          } else {
            msg = errorData.message || errorData.error || msg;
          }
        } catch {
          msg = responseText || msg;
        }
        throw new Error(msg);
      }

      let parsed: OcrResult;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new Error(t('receipts.invalidResponse'));
      }

      // OCR result is available in `parsed` — logging removed for cleanliness

      // Step 4 — AI categorisation (happens server-side in background; we just show the step briefly)
      setScanStep('categorizing');
      await new Promise((r) => setTimeout(r, 600)); // brief visual pause

      // ── Toast summary ──────────────────────────────────────────────────────
      const successResults = parsed.results?.filter((r) => r.success) ?? [];
      const duplicateCount = parsed.results?.filter((r) => r.error === 'duplicate').length ?? 0;
      const successCount = parsed.files_succeeded ?? successResults.length;
      const totalCount = parsed.files_processed ?? parsed.results?.length ?? 0;

      if (parsed.results && Array.isArray(parsed.results)) {
        if (successCount === totalCount && successCount > 0) {
          toast.success(t('receipts.scanComplete'), {
            description: isPl
              ? `Przetworzono ${successCount} paragon${successCount > 1 ? 'ów' : ''}.`
              : `Processed ${successCount} receipt${successCount !== 1 ? 's' : ''}.`,
          });
        } else if (successCount > 0) {
          let desc = isPl
            ? `Przetworzono ${successCount}/${totalCount} paragonów.`
            : `Processed ${successCount}/${totalCount} receipts.`;
          if (duplicateCount > 0) {
            desc += isPl
              ? ` ${duplicateCount} duplikat${duplicateCount > 1 ? 'ów' : ''} pominięto.`
              : ` ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} skipped.`;
          }
          toast.warning(t('receipts.partialSuccess'), { description: desc });
        } else {
          if (duplicateCount === totalCount && totalCount > 0) {
            toast.warning(t('receipts.duplicate'), { description: t('receipts.allDuplicates') });
          } else {
            toast.error(t('receipts.error'), {
              description: isPl
                ? 'Nie udało się przetworzyć żadnego paragonu.'
                : 'Failed to process any receipts.',
            });
          }
        }
      } else {
        toast.success(t('receipts.completed'), { description: t('receipts.completedDesc') });
      }

      // ── Show review step if we have items ──────────────────────────────────
      const firstSuccess = successResults[0];
      if (firstSuccess?.data?.items && firstSuccess.data.items.length > 0) {
        const aiItems = firstSuccess.data.aiEnrichment?.items ?? [];
        const enrichedItems: ParsedItem[] = firstSuccess.data.items.map((item, idx) => {
          const aiItem = aiItems.find((a) => a.index === idx + 1);
          return {
            name: item.name,
            nameTranslated: item.nameTranslated,
            quantity: item.quantity,
            price: item.price,
            category_id: item.category_id,
            suggestedCategory: aiItem?.suggestedCategory,
            confidence: aiItem?.confidence,
          };
        });

        setReviewItems(enrichedItems);
        setReviewMeta({
          merchant: firstSuccess.data.merchant,
          total: firstSuccess.data.total,
          currency: firstSuccess.data.currency,
          date: firstSuccess.data.date,
          exchangeRate: firstSuccess.data.exchangeRate,
          detectedLanguage: firstSuccess.data.detectedLanguage,
          receiptId: firstSuccess.receipt_id,
          ocrResult: parsed,
        });
        setIsReviewing(true);
        setIsBusy(false);
        setScanStep(null);
        return; // don't close yet — wait for user review
      }

      onParsed?.(parsed ?? {});
      resetState();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t('receipts.scanError');
      if (process.env.NODE_ENV === 'development') {
        console.error('[ScanReceipt] catch:', err);
      }
      setErrorMsg(msg);
    } finally {
      setIsBusy(false);
      setScanStep(null);
    }
  };

  // ── Form submit wrapper (used by the manual "Scan" button) ─────────────────

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runScan(files);
  };

  // ─── Review helpers ──────────────────────────────────────────────────────────

  const startReviewEdit = (index: number) => {
    const item = reviewItems[index];
    setEditingReviewIndex(index);
    setEditReviewName(item.name);
    setEditReviewCategory(item.suggestedCategory ?? '');
    setEditReviewPrice(item.price != null ? String(item.price) : '');
    setEditReviewQuantity(item.quantity != null ? String(item.quantity) : '1');
  };

  const saveReviewEdit = (index: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              name: editReviewName.trim() || item.name,
              suggestedCategory: editReviewCategory || item.suggestedCategory,
              price: editReviewPrice ? parseFloat(editReviewPrice.replace(',', '.')) : item.price,
              quantity: editReviewQuantity ? parseInt(editReviewQuantity, 10) || item.quantity : item.quantity,
            }
          : item
      )
    );
    setEditingReviewIndex(null);
  };

  const handleSaveAndClose = async () => {
    // Persist user's edited items to DB via PUT
    if (reviewMeta?.receiptId && reviewItems.length > 0) {
      try {
        const res = await fetch('/api/data/receipts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: reviewMeta.receiptId,
            items: reviewItems.map(item => ({
              name: item.name,
              nameTranslated: item.nameTranslated || null,
              quantity: item.quantity ?? 1,
              price: item.price ?? 0,
              category_id: item.category_id || null,
            })),
          }),
        });
        if (!res.ok) {
          toast.error(t('errors.saveFailed'));
        }
      } catch {
        toast.error(t('errors.saveFailed'));
      }
    }
    onParsed?.(reviewMeta?.ocrResult ?? null);
    resetState();
    onClose();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const hasFiles = files.length > 0;

  // ── Review step render ─────────────────────────────────────────────────────
  if (isReviewing) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleSaveAndClose(); }}>
        <SheetContent className="w-full flex flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="p-6 border-b">
            <SheetTitle className="text-xl font-semibold">
              {t('receipts.reviewItems')}
            </SheetTitle>
            <SheetDescription className="space-y-1">
              <span className="flex flex-wrap items-center gap-1.5">
                {reviewMeta?.merchant && (
                  <span className="font-medium text-foreground">{reviewMeta.merchant}</span>
                )}
                {reviewMeta?.date && (
                  <span className="text-muted-foreground">&bull; {reviewMeta.date}</span>
                )}
                {reviewMeta?.total !== undefined && reviewMeta.currency && (
                  <span className="text-muted-foreground font-medium">
                    &bull; {getCurrencySymbol(reviewMeta.currency)}{reviewMeta.total?.toFixed(2)} {reviewMeta.currency}
                  </span>
                )}
                {reviewMeta?.detectedLanguage && reviewMeta.detectedLanguage !== 'pl' && reviewMeta.detectedLanguage !== 'en' && (
                  <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                    {({ es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹', pt: '🇵🇹' } as Record<string, string>)[reviewMeta.detectedLanguage] ?? '🌍'} {reviewMeta.detectedLanguage.toUpperCase()}
                  </span>
                )}
              </span>
              {reviewMeta?.exchangeRate && reviewMeta.currency && reviewMeta.currency !== accountCurrency && reviewMeta.total !== undefined && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ≈ {(reviewMeta.total * reviewMeta.exchangeRate).toFixed(2)} {accountCurrency} ({reviewMeta.exchangeRate.toFixed(4)} {accountCurrency}/{reviewMeta.currency})
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              {reviewItems.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {t('receipts.noItemsDisplay')}
                </p>
              )}

              {/* Column headers */}
              {reviewItems.length > 0 && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 pb-1">
                  <span>{t('receipts.product')}</span>
                  <span className="w-20 text-right">{t('receipts.itemPrice')}</span>
                  <span className="w-7" />
                </div>
              )}

              {reviewItems.map((item, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5"
                >
                  {editingReviewIndex === index ? (
                    <div className="space-y-2">
                      <Input
                        value={editReviewName}
                        onChange={(e) => setEditReviewName(e.target.value)}
                        className="h-8 text-sm"
                        placeholder={t('receipts.itemNamePlaceholder')}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveReviewEdit(index); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingReviewIndex(null); }
                        }}
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editReviewPrice}
                          onChange={(e) => setEditReviewPrice(e.target.value)}
                          className="h-8 text-sm w-24"
                          placeholder={t('receipts.itemPrice')}
                        />
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={editReviewQuantity}
                          onChange={(e) => setEditReviewQuantity(e.target.value)}
                          className="h-8 text-sm w-16"
                          placeholder="Qty"
                        />
                      </div>
                      {categories.length > 0 && (
                        <Select value={editReviewCategory} onValueChange={setEditReviewCategory}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={t('receipts.categoryPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">
                              {t('expenses.noCategory')}
                            </SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-green-600"
                          onClick={() => saveReviewEdit(index)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {t('common.save')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setEditingReviewIndex(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.nameTranslated || item.name}
                        </p>
                        {item.nameTranslated && item.nameTranslated !== item.name && (
                          <p className="text-xs text-muted-foreground/70 truncate">{item.name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {(item.category_id || item.suggestedCategory) && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <Tag className="h-3 w-3" />
                              {item.category_id
                                ? (categories.find(c => c.id === item.category_id)?.name ?? item.suggestedCategory ?? item.category_id)
                                : item.suggestedCategory}
                            </span>
                          )}
                          {item.quantity !== null && item.quantity !== undefined && item.quantity !== 1 && (
                            <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium shrink-0 w-20 text-right">
                        {item.price !== null && item.price !== undefined
                          ? `${item.price.toFixed(2)} ${reviewMeta?.currency ?? ''}`
                          : '—'}
                      </span>
                      <Button
                        type="button"
                        aria-label={t('receipts.editItem')}
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0"
                        onClick={() => startReviewEdit(index)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <SheetFooter className="mt-auto border-t p-6 flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              {t('receipts.discard')}
            </Button>
            {reviewMeta?.receiptId && (
              <Button
                type="button"
                variant="outline"
                asChild
              >
                <a
                  href={`/receipt/${reviewMeta.receiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('receipts.viewEReceipt')}
                </a>
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSaveAndClose}
              className="min-w-[130px]"
            >
              <Check className="mr-2 h-4 w-4" />
              {t('receipts.saveAndClose')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Upload step render ─────────────────────────────────────────────────────
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open && !isBusy) handleClose(); }}>
      <SheetContent className="w-full flex flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-xl font-semibold">
            {t('receipts.newScan')}
          </SheetTitle>
          <SheetDescription>
            {isPl
              ? 'Dodaj zdjęcia paragonu. System odczyta dane przez OCR i AI.'
              : 'Add receipt images. The system will extract data via OCR and AI.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form id="scan-receipt-form" onSubmit={onSubmit} className="space-y-5">

            {/* ── Drop zone ── */}
            {!isBusy && (
              <div className="space-y-3">
                <Label htmlFor="file-upload">{t('receipts.addFile')}</Label>
                <label
                  ref={dropRef}
                  htmlFor="file-upload"
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/20 bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <UploadCloud
                    className={cn(
                      'h-9 w-9 transition-colors',
                      isDragOver ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <p className="mt-2 text-sm text-muted-foreground text-center">
                    <span className="font-semibold text-primary">
                      {t('receipts.click')}
                    </span>{' '}
                    {t('receipts.dragDrop')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('receipts.selectFiles')} &mdash; {t('receipts.maxSize')}
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

                {/* ── Camera capture button (mobile only) ── */}
                <div className="md:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={isBusy}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <ScanLine className="h-4 w-4" />
                    {t('receipts.takePhoto')}
                  </Button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isBusy}
                  />
                </div>
              </div>
            )}

            {/* ── File list with thumbnails ── */}
            {hasFiles && !isBusy && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {`${t('receipts.selectedFiles')} (${files.length})`}
                </p>
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2"
                  >
                    <FileThumbnail file={file} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      aria-label={t('receipts.removeFile')}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Scanning progress ── */}
            {isBusy && scanStep && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-center text-muted-foreground">
                  {t('receipts.processingReceipt')}
                </p>
                <ScanProgress step={scanStep} />
                <p className="text-xs text-center text-muted-foreground">
                  {isPl
                    ? 'Może to potrwać 10–30 sekund.'
                    : 'This may take 10–30 seconds.'}
                </p>
              </div>
            )}

            {/* ── Error with retry ── */}
            {errorMsg && !isBusy && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setErrorMsg(null)}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  {t('receipts.tryAgain')}
                </Button>
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
          <Button
            type="submit"
            form="scan-receipt-form"
            disabled={isBusy || files.length === 0}
            className="min-w-[130px]"
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('receipts.processing')}
              </>
            ) : (
              t('receipts.scan')
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
