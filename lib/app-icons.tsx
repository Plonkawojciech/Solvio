'use client'

/**
 * Jednolity system ikon (Notes Classic) — zamiast kolorowych emotek.
 *
 * - Rejestr ~50 monochromatycznych ikon lucide dopasowanych do finansów.
 * - `AppIcon` renderuje ikonę w chipie z tłem; kolor dziedziczy z palety
 *   aplikacji (currentColor), więc zawsze pasuje do motywu.
 * - Wsteczna zgodność: w bazie zostają stare emotki (czyta je też iOS) —
 *   `resolveIconName` mapuje emoji → nazwa ikony przy wyświetlaniu.
 *   Nowe rekordy z webu zapisują już nazwy ikon (np. "shopping-cart").
 */

import * as React from 'react'
import {
  ShoppingCart, ShoppingBag, Utensils, Pizza, Coffee, Beer,
  Car, Bus, Bike, Plane, Fuel, TrainFront,
  Home, Sofa, Wrench, Droplets, Plug, Wifi, Flame,
  Pill, Stethoscope, Dumbbell, HeartPulse,
  Clapperboard, Tv, Music, Headphones, Gamepad2, PartyPopper, Ticket,
  Laptop, Smartphone, Cloud, Camera as CameraIcon,
  Shirt, Gem, Gift, Scissors,
  GraduationCap, BookOpen, Baby, PawPrint,
  Briefcase, Building2, Receipt, CreditCard, Banknote, PiggyBank, Wallet,
  TrendingUp, Target, Repeat, Package, Landmark, Umbrella, Leaf, Globe,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/* ── Rejestr ── */

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // zakupy i jedzenie
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  'utensils': Utensils,
  'pizza': Pizza,
  'coffee': Coffee,
  'beer': Beer,
  // transport
  'car': Car,
  'bus': Bus,
  'bike': Bike,
  'plane': Plane,
  'fuel': Fuel,
  'train': TrainFront,
  // dom i media
  'home': Home,
  'sofa': Sofa,
  'wrench': Wrench,
  'droplets': Droplets,
  'plug': Plug,
  'wifi': Wifi,
  'flame': Flame,
  // zdrowie
  'pill': Pill,
  'stethoscope': Stethoscope,
  'dumbbell': Dumbbell,
  'heart-pulse': HeartPulse,
  // rozrywka
  'clapperboard': Clapperboard,
  'tv': Tv,
  'music': Music,
  'headphones': Headphones,
  'gamepad': Gamepad2,
  'party': PartyPopper,
  'ticket': Ticket,
  // elektronika
  'laptop': Laptop,
  'smartphone': Smartphone,
  'cloud': Cloud,
  'camera': CameraIcon,
  // styl życia
  'shirt': Shirt,
  'gem': Gem,
  'gift': Gift,
  'scissors': Scissors,
  'graduation-cap': GraduationCap,
  'book': BookOpen,
  'baby': Baby,
  'paw': PawPrint,
  // finanse i praca
  'briefcase': Briefcase,
  'building': Building2,
  'receipt': Receipt,
  'credit-card': CreditCard,
  'banknote': Banknote,
  'piggy-bank': PiggyBank,
  'wallet': Wallet,
  'trending-up': TrendingUp,
  'target': Target,
  'repeat': Repeat,
  'package': Package,
  'landmark': Landmark,
  'umbrella': Umbrella,
  'leaf': Leaf,
  'globe': Globe,
}

export const ICON_NAMES = Object.keys(ICON_REGISTRY)

/* ── Mapa legacy: emoji zapisane w bazie → nazwa ikony ── */

const EMOJI_TO_ICON: Record<string, string> = {
  '🍕': 'pizza', '🍽️': 'utensils', '🍔': 'utensils', '☕': 'coffee', '🍺': 'beer', '🍻': 'beer',
  '🛒': 'shopping-cart', '🛍️': 'shopping-bag', '🧺': 'shopping-bag',
  '💊': 'pill', '🩺': 'stethoscope', '🏋️': 'dumbbell', '🏋️‍♂️': 'dumbbell', '❤️': 'heart-pulse', '💪': 'dumbbell',
  '🚗': 'car', '🚕': 'car', '🚌': 'bus', '🚲': 'bike', '✈️': 'plane', '⛽': 'fuel', '🚄': 'train', '🚂': 'train',
  '🏡': 'home', '🏠': 'home', '🛋️': 'sofa', '🔧': 'wrench', '💧': 'droplets', '🔌': 'plug', '📶': 'wifi', '🔥': 'flame',
  '🎬': 'clapperboard', '📺': 'tv', '🎵': 'music', '🎧': 'headphones', '🎮': 'gamepad', '🎉': 'party', '🎫': 'ticket', '🎭': 'ticket',
  '💻': 'laptop', '📱': 'smartphone', '☁️': 'cloud', '📷': 'camera', '📸': 'camera',
  '👕': 'shirt', '👗': 'shirt', '👟': 'shirt', '💍': 'gem', '💎': 'gem', '🎁': 'gift', '💇': 'scissors',
  '🎓': 'graduation-cap', '📚': 'book', '📖': 'book', '👶': 'baby', '🐕': 'paw', '🐈': 'paw', '🐾': 'paw',
  '💼': 'briefcase', '🏢': 'building', '🧾': 'receipt', '📋': 'receipt', '💳': 'credit-card', '💵': 'banknote', '💸': 'banknote', '💰': 'piggy-bank', '🐷': 'piggy-bank',
  '👛': 'wallet', '📈': 'trending-up', '📊': 'trending-up', '🎯': 'target', '🔁': 'repeat', '🔄': 'repeat',
  '📦': 'package', '🏦': 'landmark', '🏛️': 'landmark', '☂️': 'umbrella', '🌱': 'leaf', '🌍': 'globe', '🌐': 'globe',
  '👥': 'globe', '⚡': 'plug', '🎂': 'party', '💡': 'plug',
}

/// Zwraca nazwę ikony z rejestru dla dowolnej zapisanej wartości
/// (nazwa ikony / legacy emoji / null) — z bezpiecznym fallbackiem.
export function resolveIconName(value: string | null | undefined, fallback = 'package'): string {
  if (!value) return fallback
  const v = value.trim()
  if (ICON_REGISTRY[v]) return v
  if (EMOJI_TO_ICON[v]) return EMOJI_TO_ICON[v]
  return fallback
}

/* ── AppIcon: ikona w chipie, kolor z palety ── */

export function AppIcon({
  value,
  fallback = 'package',
  className,
  size = 'md',
  chipClassName,
}: {
  /// wartość z bazy: nazwa ikony albo legacy emoji
  value: string | null | undefined
  fallback?: string
  className?: string
  /// sm = 24px chip, md = 30px, lg = 36px
  size?: 'sm' | 'md' | 'lg'
  /// klasy chipa (tło/kolor) — domyślnie neutralny tint
  chipClassName?: string
}) {
  const Icon = ICON_REGISTRY[resolveIconName(value, fallback)]
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : size === 'lg' ? 'h-9 w-9 rounded-xl' : 'h-[30px] w-[30px] rounded-lg'
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-4.5 w-4.5' : 'h-4 w-4'
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center bg-muted text-muted-foreground', box, chipClassName)}>
      <Icon className={cn(icon, className)} aria-hidden="true" />
    </span>
  )
}

/* ── IconPicker: siatka do wyboru ikony (zamiast pola emoji) ── */

export function IconPicker({
  value,
  onChange,
  pl,
}: {
  value: string
  onChange: (name: string) => void
  pl?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" type="button" className="h-10 w-14 px-0" aria-label={pl ? 'Wybierz ikonę' : 'Pick an icon'}>
          <AppIcon value={value} size="sm" chipClassName="bg-secondary text-secondary-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[264px] p-2" align="start">
        <div className="grid grid-cols-7 gap-1 max-h-56 overflow-y-auto">
          {ICON_NAMES.map((name) => {
            const Icon = ICON_REGISTRY[name]
            const active = resolveIconName(value) === name
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { onChange(name); setOpen(false) }}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
