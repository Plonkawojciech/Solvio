// Simple i18n system for PL/EN

export type Language = 'pl' | 'en'

const translations = {
  pl: {
    // Common
    'common.loading': 'Ładowanie...',
    'common.save': 'Zapisz',
    'common.cancel': 'Anuluj',
    'common.delete': 'Usuń',
    'common.edit': 'Edytuj',
    'common.add': 'Dodaj',
    'common.refresh': 'Odśwież',
    'common.close': 'Zamknij',
    
    // Navigation
    'nav.dashboard': 'Panel',
    'nav.expenses': 'Wydatki',
    'nav.reports': 'Raporty',
    'nav.settings': 'Ustawienia',
    
    // Dashboard
    'dashboard.title': 'Panel Finansowy',
    'dashboard.thisMonth': 'Ten Miesiąc',
    'dashboard.totalSpent': 'Wydano Łącznie',
    'dashboard.transactions': 'transakcje',
    'dashboard.perDay': 'dziennie średnio',
    'dashboard.budgetProgress': 'Postęp Budżetu',
    'dashboard.left': 'zostało',
    'dashboard.over': 'przekroczono',
    'dashboard.used': 'użyto',
    'dashboard.budget': 'budżetu',
    'dashboard.recentActivity': 'Ostatnia Aktywność',
    'dashboard.topCategories': 'Top Kategorie',
    'dashboard.categoryBudgets': 'Budżety Kategorii',
    'dashboard.weeklySpending': 'Wydatki Tygodniowe',
    'dashboard.monthlySpending': 'Wydatki Miesięczne',
    'dashboard.receiptsScanned': 'Zeskanowane Paragony',
    'dashboard.biggestPurchase': 'Największy Zakup',
    'dashboard.avgTransaction': 'Średnia Transakcja',
    'dashboard.topCategory': 'Top Kategoria',
    'dashboard.viewAllExpenses': 'Zobacz Wszystkie',
    'dashboard.spendingOverview': 'Przegląd wydatków z ostatnich 30 dni',
    'dashboard.whereMoneyGoes': 'Gdzie idą Twoje pieniądze',
    'dashboard.trackSpending': 'Śledź wydatki względem budżetów miesięcznych dla każdej kategorii',
    'dashboard.dailyExpenses': 'Dzienne wydatki z podziałem na kategorie',
    'dashboard.aiProcessed': 'Przetworzone przez AI',
    'dashboard.largestTransaction': 'Największa transakcja',
    'dashboard.averagePerTransaction': 'Średnia na transakcję',
    'dashboard.highestSpending': 'Najwyższe wydatki',
    'dashboard.latestTransactions': 'Twoje najnowsze transakcje',
    'dashboard.noExpensesYet': 'Brak wydatków jeszcze. Zacznij od zeskanowania paragonu lub dodania wydatku ręcznie.',
    
    // Expenses
    'expenses.title': 'Wydatki',
    'expenses.vendor': 'Sklep',
    'expenses.amount': 'Kwota',
    'expenses.date': 'Data',
    'expenses.category': 'Kategoria',
    'expenses.actions': 'Akcje',
    'expenses.receiptItems': 'Produkty z Paragonu',
    'expenses.noExpenses': 'Brak wydatków',
    'expenses.noItems': 'Brak produktów',
    'expenses.titleCol': 'Tytuł',
    'expenses.delete': 'Usuń',
    'expenses.deleting': 'Usuwanie...',
    'expenses.deleteConfirm': 'Czy na pewno chcesz usunąć ten wydatek?',
    'expenses.deleteItemConfirm': 'Czy na pewno chcesz usunąć te produkty?',
    'expenses.noCategory': 'Brak kategorii',
    'expenses.qty': 'Ilość',
    'expenses.price': 'Cena',
    'expenses.selectAll': 'Zaznacz wszystkie',
    'expenses.retry': 'Spróbuj ponownie',
    'expenses.addFirst': 'Dodaj swój pierwszy!',
    
    // Settings
    'settings.title': 'Ustawienia',
    'settings.general': 'Ogólne',
    'settings.language': 'Język',
    'settings.currency': 'Waluta',
    'settings.categories': 'Zarządzaj Kategoriami',
    'settings.categoriesDesc': 'Dodaj, edytuj lub usuń kategorie wydatków. Te kategorie są używane przez AI przy skanowaniu paragonów.',
    'settings.managePreferences': 'Zarządzaj preferencjami i budżetami kategorii.',
    'settings.languageCurrency': 'Preferencje języka i waluty.',
    'settings.defaultCategories': 'Domyślne Kategorie',
    'settings.loadDefaults': 'Załaduj Domyślne',
    'settings.loadingDefaults': 'Ładowanie...',
    'settings.defaultCategoriesDesc': 'Załaduj 10 domyślnych kategorii: Jedzenie, Zakupy, Zdrowie, Transport, Zakupy, Elektronika, Dom i Ogród, Rozrywka, Rachunki, Inne',
    'settings.categoryName': 'Nazwa Kategorii',
    'settings.addCategory': 'Dodaj',
    'settings.noCategories': 'Brak kategorii jeszcze. Dodaj swoją pierwszą kategorię powyżej.',
    'settings.deleteCategory': 'Usunąć Kategorię?',
    'settings.deleteCategoryDesc': 'To usunie kategorię. Istniejące wydatki z tą kategorią zachowają ją, ale nie będziesz mógł przypisać jej do nowych wydatków.',
    'settings.saved': 'Ustawienia zapisane',
    'settings.savedDesc': 'Twoje preferencje i budżety zostały zaktualizowane.',
    
    // Reports
    'reports.title': 'Raporty',
    'reports.yearly': 'Roczne',
    'reports.monthly': 'Miesięczne',
    'reports.custom': 'Niestandardowy Raport',
    'reports.description': 'Pobierz roczne podsumowania lub rozwiń rok, aby uzyskać dostęp do plików miesięcznych. Pokazane są tylko okresy z wydatkami.',
    'reports.yearlySummary': 'Podsumowanie roczne',
    'reports.showMonths': 'Pokaż miesiące',
    'reports.pickRange': 'Wybierz zakres, filtry i format.',
    'reports.regenerate': 'Wygeneruj ponownie',
    
    // Receipts
    'receipts.scan': 'Skanuj Paragon',
    'receipts.add': 'Dodaj Wydatek',
    'receipts.duplicate': 'Duplikat Paragonu',
    'receipts.duplicateDesc': 'Ten paragon został już wcześniej wgrany.',
    'receipts.scanning': 'Skanowanie...',
    'receipts.uploading': 'Wgrywanie...',
    'receipts.processing': 'Przetwarzanie...',
    'receipts.completed': 'Zakończono skanowanie',
    'receipts.completedDesc': 'Dane z paragonu zostały odczytane.',
    'receipts.error': 'Błąd',
    'receipts.addFile': 'Dodaj plik',
    'receipts.remove': 'Usuń',
    'receipts.selectFiles': 'Wybierz pliki (JPG, PNG, HEIC)',
    'receipts.maxSize': 'Maksymalny rozmiar: 4MB na plik',
    'receipts.filesProcessed': 'Przetworzono',
    'receipts.filesSucceeded': 'Sukces',
    'receipts.filesFailed': 'Błąd',
    'receipts.partialSuccess': 'Częściowe powodzenie',
    'receipts.allDuplicates': 'Wszystkie paragony to duplikaty',
    'receipts.processingFiles': 'Przetwarzanie plików...',
    'receipts.filesProcessed': 'Przetworzono',
    'receipts.filesSucceeded': 'Sukces',
    'receipts.filesFailed': 'Błąd',
    
    // Auth
    'auth.signIn': 'Zaloguj się',
    'auth.signUp': 'Zarejestruj się',
    'auth.logout': 'Wyloguj',
    'auth.email': 'Email',
    'auth.password': 'Hasło',
    'auth.hey': 'Cześć',
    'auth.welcome': 'Witaj',
    'auth.forgotPassword': 'Zapomniałeś hasła?',
    'auth.resetPassword': 'Resetuj Hasło',
    'auth.confirmEmail': 'Potwierdź Email',
    'auth.updatePassword': 'Zaktualizuj Hasło',
  },
  en: {
    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.refresh': 'Refresh',
    'common.close': 'Close',
    
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.expenses': 'Expenses',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    
    // Dashboard
    'dashboard.title': 'Financial Dashboard',
    'dashboard.thisMonth': 'This Month',
    'dashboard.totalSpent': 'Total Spent',
    'dashboard.transactions': 'transactions',
    'dashboard.perDay': 'per day average',
    'dashboard.budgetProgress': 'Budget Progress',
    'dashboard.left': 'left',
    'dashboard.over': 'over',
    'dashboard.used': 'used',
    'dashboard.budget': 'budget',
    'dashboard.recentActivity': 'Recent Activity',
    'dashboard.topCategories': 'Top Categories',
    'dashboard.categoryBudgets': 'Category Budgets',
    'dashboard.weeklySpending': 'Weekly Spending',
    'dashboard.monthlySpending': 'Monthly Spending',
    'dashboard.receiptsScanned': 'Receipts Scanned',
    'dashboard.biggestPurchase': 'Biggest Purchase',
    'dashboard.avgTransaction': 'Avg Transaction',
    'dashboard.topCategory': 'Top Category',
    'dashboard.viewAllExpenses': 'View All Expenses',
    'dashboard.spendingOverview': 'Your spending overview for the last 30 days',
    'dashboard.whereMoneyGoes': 'Where your money goes',
    'dashboard.trackSpending': 'Track your spending against monthly budgets for each category',
    'dashboard.dailyExpenses': 'Daily expenses breakdown showing spending across all categories',
    'dashboard.aiProcessed': 'AI-processed this month',
    'dashboard.largestTransaction': 'Largest single transaction',
    'dashboard.averagePerTransaction': 'Average per transaction',
    'dashboard.highestSpending': 'Highest spending',
    'dashboard.latestTransactions': 'Your latest transactions',
    'dashboard.noExpensesYet': 'No expenses yet. Start by scanning a receipt or adding an expense manually.',
    
    // Expenses
    'expenses.title': 'Expenses',
    'expenses.vendor': 'Vendor',
    'expenses.amount': 'Amount',
    'expenses.date': 'Date',
    'expenses.category': 'Category',
    'expenses.actions': 'Actions',
    'expenses.receiptItems': 'Receipt Items',
    'expenses.noExpenses': 'No expenses found',
    'expenses.noItems': 'No items found',
    'expenses.titleCol': 'Title',
    'expenses.delete': 'Delete',
    'expenses.deleting': 'Deleting...',
    'expenses.deleteConfirm': 'Are you sure you want to delete this expense?',
    'expenses.deleteItemConfirm': 'Are you sure you want to delete these items?',
    'expenses.noCategory': 'No category',
    'expenses.qty': 'Qty',
    'expenses.price': 'Price',
    'expenses.selectAll': 'Select all',
    'expenses.retry': 'Retry',
    'expenses.addFirst': 'Add your first one!',
    
    // Settings
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.language': 'Language',
    'settings.currency': 'Currency',
    'settings.categories': 'Manage Categories',
    'settings.categoriesDesc': 'Add, edit, or remove expense categories. These categories are used by AI when scanning receipts.',
    'settings.managePreferences': 'Manage your preferences and category budgets.',
    'settings.languageCurrency': 'Language and currency preferences.',
    'settings.defaultCategories': 'Default Categories',
    'settings.loadDefaults': 'Load Defaults',
    'settings.loadingDefaults': 'Updating...',
    'settings.defaultCategoriesDesc': 'Load 10 default categories: Food, Groceries, Health, Transport, Shopping, Electronics, Home & Garden, Entertainment, Bills & Utilities, Other',
    'settings.categoryName': 'Category Name',
    'settings.addCategory': 'Add',
    'settings.noCategories': 'No categories yet. Add your first category above.',
    'settings.deleteCategory': 'Delete Category?',
    'settings.deleteCategoryDesc': 'This will remove the category. Existing expenses with this category will keep it, but you won\'t be able to assign it to new expenses.',
    'settings.saved': 'Settings saved',
    'settings.savedDesc': 'Your preferences and budgets have been updated.',
    
    // Reports
    'reports.title': 'Reports',
    'reports.yearly': 'Yearly',
    'reports.monthly': 'Monthly',
    'reports.custom': 'Custom Report',
    'reports.description': 'Download yearly summaries or expand a year to access monthly files. Only periods with expenses are shown.',
    'reports.yearlySummary': 'Yearly summary',
    'reports.showMonths': 'Show months',
    'reports.pickRange': 'Pick range, filters and format.',
    'reports.regenerate': 'Regenerate',
    
    // Receipts
    'receipts.scan': 'Scan Receipt',
    'receipts.add': 'Add Expense',
    'receipts.duplicate': 'Duplicate Receipt',
    'receipts.duplicateDesc': 'This receipt was already uploaded earlier.',
    'receipts.scanning': 'Scanning...',
    'receipts.uploading': 'Uploading...',
    'receipts.processing': 'Processing...',
    'receipts.completed': 'Scanning completed',
    'receipts.completedDesc': 'Receipt data has been read.',
    'receipts.error': 'Error',
    'receipts.addFile': 'Add file',
    'receipts.remove': 'Remove',
    'receipts.selectFiles': 'Select files (JPG, PNG, HEIC)',
    'receipts.maxSize': 'Max size: 4MB per file',
    'receipts.filesProcessed': 'Processed',
    'receipts.filesSucceeded': 'Succeeded',
    'receipts.filesFailed': 'Failed',
    'receipts.partialSuccess': 'Partial success',
    'receipts.allDuplicates': 'All receipts are duplicates',
    'receipts.processingFiles': 'Processing files...',
    'receipts.filesProcessed': 'Processed',
    'receipts.filesSucceeded': 'Succeeded',
    'receipts.filesFailed': 'Failed',
    
    // Auth
    'auth.signIn': 'Sign In',
    'auth.signUp': 'Sign Up',
    'auth.logout': 'Logout',
    'auth.email': 'Email',
    'auth.password': 'Password',
  },
}

let currentLanguage: Language = 'en'

export function setLanguage(lang: Language) {
  currentLanguage = lang
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lang)
  }
}

export function getLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language') as Language
    if (stored && (stored === 'pl' || stored === 'en')) {
      return stored
    }
  }
  // During SSR, always return 'en' to avoid hydration mismatch
  return typeof window !== 'undefined' ? currentLanguage : 'en'
}

export function t(key: string): string {
  const lang = getLanguage()
  return translations[lang][key as keyof typeof translations[typeof lang]] || key
}

// Hook for React components
export function useTranslation() {
  // Always start with 'en' to match SSR - this prevents hydration mismatch
  const [lang, setLang] = React.useState<Language>('en')
  const [mounted, setMounted] = React.useState(false)
  
  React.useEffect(() => {
    // Only update after mount to avoid hydration mismatch
    setMounted(true)
    const stored = localStorage.getItem('language') as Language
    if (stored && (stored === 'pl' || stored === 'en')) {
      setLang(stored)
      currentLanguage = stored
    } else {
      // If no stored language, check user settings from DB (async, so do it here)
      // This will be handled by components that need it
    }
  }, [])
  
  const changeLanguage = (newLang: Language) => {
    setLanguage(newLang)
    setLang(newLang)
    window.location.reload() // Reload to apply translations
  }
  
  // CRITICAL: Always use 'en' during SSR and first render to prevent hydration mismatch
  // Only use actual language after component has mounted
  const currentLang = mounted ? lang : 'en'
  
  const translate = (key: string): string => {
    // During SSR and first render, always return English
    const langToUse = mounted ? currentLang : 'en'
    return translations[langToUse][key as keyof typeof translations[typeof langToUse]] || key
  }
  
  return { t: translate, lang: currentLang, changeLanguage, mounted }
}

// Import React for hook
import React from 'react'
