// Simple i18n system for PL/EN

export type Language = 'pl' | 'en'

const translations = {
  pl: {
    // Common
    'common.loading': 'Ładowanie...',
    'common.save': 'Zapisz',
    'common.cancel': 'Anuluj',
    'common.delete': 'Usuń',
    'common.add': 'Dodaj',
    
    // Navigation
    'nav.dashboard': 'Panel',
    'nav.expenses': 'Wydatki',
    'nav.reports': 'Raporty',
    'nav.settings': 'Ustawienia',
    
    // Dashboard
    'dashboard.transactions': 'transakcje',
    'dashboard.perDay': 'dziennie średnio',
    'dashboard.budgetProgress': 'Postęp Budżetu',
    'dashboard.over': 'przekroczono',
    'dashboard.budget': 'budżetu',
    'dashboard.recentActivity': 'Ostatnia Aktywność',
    'dashboard.topCategories': 'Top Kategorie',
    'dashboard.biggestPurchase': 'Największy Zakup',
    'dashboard.viewAllExpenses': 'Zobacz Wszystkie',
    
    // Expenses
    'expenses.title': 'Wydatki',
    'expenses.amount': 'Kwota',
    'expenses.category': 'Kategoria',
    'expenses.actions': 'Akcje',
    'expenses.receiptItems': 'Produkty z Paragonu',
    'expenses.noExpenses': 'Brak wydatków',
    'expenses.noItems': 'Brak produktów',
    'expenses.titleCol': 'Tytuł',
    'expenses.delete': 'Usuń',
    'expenses.deleting': 'Usuwanie...',
    'expenses.noCategory': 'Brak kategorii',
    'expenses.price': 'Cena',
    'expenses.selectAll': 'Zaznacz wszystkie',
    'expenses.retry': 'Spróbuj ponownie',
    'expenses.viewReceipt': 'Zobacz paragon',
    'expenses.saveEdit': 'Zapisz zmiany',
    'expenses.editExpense': 'Edytuj wydatek',
    'expenses.receiptImage': 'Zdjęcie paragonu',
    'expenses.noImage': 'Brak zdjęcia',
    'expenses.noExpensesTitle': 'Brak wydatków',
    'expenses.noExpensesDesc': 'Zacznij od zeskanowania paragonu lub dodania wydatku ręcznie.',
    'expenses.confirmDelete': 'Potwierdź usunięcie',
    'expenses.confirmDeleteDesc': 'Czy na pewno chcesz usunąć',
    'expenses.confirmBulkDelete': 'Usuń zaznaczone',
    'expenses.confirmBulkDeleteDesc': 'Czy na pewno chcesz usunąć zaznaczone wydatki? Tej operacji nie można cofnąć.',
    'expenses.searchPlaceholder': 'Szukaj wydatków...',
    'expenses.filterCategory': 'Filtruj kategorię',
    'expenses.allCategories': 'Wszystkie kategorie',
    'expenses.clearFilters': 'Wyczyść filtry',
    'expenses.noReceiptAttached': 'Brak paragonu',
    'expenses.itemName': 'Nazwa',
    'expenses.titleRequired': 'Tytuł jest wymagany',
    'expenses.amountRequired': 'Kwota musi być większa niż 0',
    'expenses.itemNameRequired': 'Nazwa jest wymagana',
    'expenses.itemPriceRequired': 'Cena musi być większa niż 0',
    'expenses.dateFrom': 'Data od',
    'expenses.dateTo': 'Data do',
    'expenses.exportCsv': 'Eksportuj CSV',
    'expenses.sortAsc': 'Rosnąco',
    'expenses.sortDesc': 'Malejąco',
    'expenses.page': 'Strona',
    'expenses.of': 'z',
    'expenses.prevPage': 'Poprzednia',
    'expenses.nextPage': 'Następna',
    'expenses.showing': 'Wyświetlono',
    'expenses.results': 'wyników',
    'expenses.copyLink': 'Kopiuj link',
    'expenses.linkCopied': 'Skopiowano!',
    'expenses.qrCode': 'Kod QR',
    'expenses.openReceipt': 'Otwórz',
    'expenses.viewEReceipt': 'Pokaż e-paragon',
    'expenses.scanQr': 'Zeskanuj, aby otworzyć paragon',
    'expenses.selectToPreview': 'Wybierz wydatek z listy, aby zobaczyć szczegóły',
    'expenses.moreFilters': 'Więcej filtrów',

    // Categories
    'categories.food': 'Jedzenie',
    'categories.groceries': 'Zakupy spożywcze',
    'categories.health': 'Zdrowie',
    'categories.transport': 'Transport',
    'categories.shopping': 'Zakupy',
    'categories.electronics': 'Elektronika',
    'categories.homeGarden': 'Dom i Ogród',
    'categories.entertainment': 'Rozrywka',
    'categories.billsUtilities': 'Rachunki i Media',
    'categories.other': 'Inne',
    
    // Settings
    'settings.language': 'Język',
    'settings.currency': 'Waluta domyslna',
    'settings.currencySubtitle': 'Uzywana przy recznym dodawaniu wydatkow. Paragony wykrywaja walute automatycznie.',
    'settings.defaultCategories': 'Domyślne Kategorie',
    'settings.loadDefaults': 'Załaduj Domyślne',
    'settings.loadingDefaults': 'Ładowanie...',
    'settings.defaultCategoriesDesc': 'Załaduj 10 domyślnych kategorii: Jedzenie, Zakupy, Zdrowie, Transport, Zakupy, Elektronika, Dom i Ogród, Rozrywka, Rachunki, Inne',
    'settings.categoryName': 'Nazwa Kategorii',
    'settings.noCategories': 'Brak kategorii jeszcze. Dodaj swoją pierwszą kategorię powyżej.',
    'settings.noCategoriesForBudget': 'Brak kategorii. Najpierw dodaj kategorie poniżej.',
    'settings.deleteCategory': 'Usunąć Kategorię?',
    'settings.deleteCategoryDesc': 'To usunie kategorię. Istniejące wydatki z tą kategorią zachowają ją, ale nie będziesz mógł przypisać jej do nowych wydatków.',
    'settings.saved': 'Ustawienia zapisane',
    'settings.savedDesc': 'Twoje preferencje i budżety zostały zaktualizowane.',
    'settings.categoriesSeedFailed': 'Nie udało się załadować kategorii',
    'settings.unknownError': 'Nieznany błąd',
    'settings.categoriesUpdated': 'Kategorie zaktualizowane!',
    'settings.categoriesUpdatedDesc': 'Kategorie domyślne zostały załadowane.',
    'settings.categoryNameRequired': 'Nazwa kategorii jest wymagana',
    'settings.categoryAdded': 'Kategoria dodana pomyślnie',
    'settings.categoryAddFailed': 'Nie udało się dodać kategorii',
    'settings.categoryNameEmpty': 'Nazwa kategorii nie może być pusta',
    'settings.categoryUpdated': 'Kategoria zaktualizowana',
    'settings.categoryUpdateFailed': 'Nie udało się zaktualizować kategorii',
    'settings.categoryDeleted': 'Kategoria usunięta',
    'settings.categoryDeleteFailed': 'Nie udało się usunąć kategorii',
    'settings.categoryNamePlaceholder': 'Nazwa kategorii (np. Elektronika, Jedzenie)',
    'settings.icon': 'Ikona',

    // Reports
    
    // Receipts
    'receipts.scan': 'Skanuj Paragon',
    'receipts.add': 'Dodaj Wydatek',
    'receipts.duplicate': 'Duplikat Paragonu',
    'receipts.processing': 'Przetwarzanie...',
    'receipts.completed': 'Zakończono skanowanie',
    'receipts.completedDesc': 'Dane z paragonu zostały odczytane.',
    'receipts.error': 'Błąd',
    'receipts.addFile': 'Dodaj plik',
    'receipts.selectFiles': 'Wybierz pliki (JPG, PNG, HEIC)',
    'receipts.maxSize': 'Maksymalny rozmiar: 4MB na plik',
    'receipts.partialSuccess': 'Częściowe powodzenie',
    'receipts.allDuplicates': 'Wszystkie paragony to duplikaty',
    'receipts.takePhoto': 'Zrób zdjęcie',
    'receipts.viewEReceipt': 'Pokaż e-paragon',
    'receipts.addFileFirst': 'Dodaj przynajmniej jeden plik.',
    'receipts.ocrError': 'OCR zwrócił błąd.',
    'receipts.requestTooLarge': 'Za duży plik',
    'receipts.formatError': 'Błąd formatu',
    'receipts.duplicateReceipt': 'Duplikat paragonu',
    'receipts.duplicateReceiptDesc': 'Ten paragon został już dodany.',
    'receipts.invalidResponse': 'Nieprawidłowa odpowiedź serwera.',
    'receipts.scanComplete': 'Skanowanie zakończone',
    'receipts.scanError': 'Błąd podczas skanowania.',
    'receipts.reviewItems': 'Sprawdź pozycje paragonu',
    'receipts.noItemsDisplay': 'Brak pozycji do wyświetlenia.',
    'receipts.product': 'Produkt',
    'receipts.itemPrice': 'Cena',
    'receipts.itemNamePlaceholder': 'Nazwa produktu',
    'receipts.categoryPlaceholder': 'Kategoria',
    'receipts.newScan': 'Nowy skan paragonu',
    'receipts.click': 'Kliknij',
    'receipts.dragDrop': 'lub przeciągnij pliki tutaj',
    'receipts.selectedFiles': 'Wybrane pliki',
    'receipts.processingReceipt': 'Przetwarzanie paragonu...',
    'receipts.tryAgain': 'Spróbuj ponownie',
    'receipts.discard': 'Odrzuć',
    'receipts.saveAndClose': 'Zapisz i zamknij',

    // Analysis & Audit
    'nav.analysis': 'Analiza AI',
    'nav.audit': 'Audyt zakupów',
    'analysis.refreshAi': 'Odśwież AI',

    // Auth
    'auth.signIn': 'Zaloguj się',
    'auth.signUp': 'Zarejestruj się',

    // Sidebar
    'nav.navigation': 'Nawigacja',
    'nav.signOut': 'Wyloguj się',
    'nav.darkMode': 'Tryb ciemny',
    'nav.lightMode': 'Tryb jasny',
    'nav.bank': 'Bank',
    'nav.invoices': 'Faktury',
    'nav.vat': 'VAT',
    'nav.team': 'Zespół',
    'nav.personal': 'Osobisty',
    'nav.business': 'Firmowy',

    // Keyboard shortcuts
    'shortcuts.label': 'Skróty klawiszowe',
    'shortcuts.open': 'Otwórz skróty klawiszowe',
    'shortcuts.then': 'potem',

    // Dashboard additional
    'dashboard.failedLoad': 'Nie udało się załadować danych',
    'dashboard.failedLoadDesc': 'Wystąpił błąd podczas pobierania danych finansowych. Sprawdź połączenie i spróbuj ponownie.',
    'dashboard.tryAgain': 'Spróbuj ponownie',
    'dashboard.day': 'dzień',
    'dashboard.noCategoryData': 'Brak danych kategorii jeszcze.',
    'dashboard.vsLastMonth': 'vs zeszły miesiąc',
    'dashboard.thisWeek': 'Ten tydzień',
    'dashboard.savingsRate': 'Wskaźnik oszczędności',
    'dashboard.forecastMonth': 'Prognoza miesiąca',
    'dashboard.monthSpending': 'Wydano w tym miesiącu',
    'dashboard.monthBalance': 'Bilans miesiąca',
    'dashboard.addIncome': 'Wpisz przychody',
    'dashboard.paceMarker': 'kreska = tempo idealne',
    'dashboard.dailyAllowance': 'Na dziś',
    'dashboard.daysLeft': 'dni do końca',
    'dashboard.categorySplit': 'Struktura wydatków',
    'dashboard.vsPrevMonth': 'vs poprzedni miesiąc',
    'dashboard.comparisonHint': 'pełny = ten miesiąc · blady = poprzedni',
    'dashboard.oneOffNew': 'nowe / jednorazowe',
    'dashboard.remainingBudget': 'zostało',
    'dashboard.goodMorning': 'Dzień dobry',
    'dashboard.overBudgetShort': 'przekroczone o',
    'dashboard.nearLimitShort': 'blisko limitu',
    'dashboard.wellnessScore': 'Zdrowie finansowe',
    'dashboard.wellnessGrade': 'Ocena',
    'dashboard.wellnessSavings': 'Oszczędności',
    'dashboard.wellnessBudget': 'Budżet',
    'dashboard.wellnessTrend': 'Trend wydatków',
    'dashboard.wellnessExcellent': 'Doskonały',
    'dashboard.wellnessGood': 'Dobry',
    'dashboard.wellnessFair': 'Przeciętny',
    'dashboard.wellnessPoor': 'Słaby',
    'dashboard.wellnessBad': 'Zły',

    // Onboarding empty state
    'onboarding.title': 'Witaj w Solvio!',
    'onboarding.subtitle': 'Zacznij śledzić swoje finanse w 3 prostych krokach',
    'onboarding.step1.badge': 'Krok 1',
    'onboarding.step1.title': 'Kategorie gotowe',
    'onboarding.step1.desc': 'Twoje domyślne kategorie zostały już załadowane — Jedzenie, Transport, Zdrowie i więcej.',
    'onboarding.step1.action': 'Zarządzaj kategoriami',
    'onboarding.step2.badge': 'Krok 2',
    'onboarding.step2.title': 'Dodaj pierwszy wydatek',
    'onboarding.step2.desc': 'Zeskanuj paragon aparatem lub wpisz wydatek ręcznie. AI automatycznie przypisze kategorię.',
    'onboarding.step3.badge': 'Krok 3',
    'onboarding.step3.title': 'Odkryj wgląd w finanse',
    'onboarding.step3.desc': 'Po dodaniu wydatków zobaczysz wykresy, analizę AI i raporty PDF — wszystko automatycznie.',
    'onboarding.step3.action': 'Przejdź do analizy AI',
    'onboarding.privacy': 'Twoje dane są bezpieczne i prywatne — zawsze.',
    'onboarding.categoriesReady': 'Kategorie załadowane',

    // Onboarding product selection

    // Analysis page (hardcoded strings)

    // Dashboard weekly digest
    'dashboard.weeklyDigest': 'Tygodniowy Digest',
    'dashboard.weeklyDigestDesc': 'Podsumowanie ostatnich 7 dni wygenerowane przez AI',
    'dashboard.generateWeeklySummary': 'Podsumowanie tygodnia',
    'dashboard.weeklyGenerating': 'Generuję podsumowanie…',
    'dashboard.weeklyNoData': 'Brak wydatków w ciągu ostatnich 7 dni.',
    'dashboard.weeklyError': 'Nie udało się wygenerować podsumowania.',
    'dashboard.categoryTrends': 'Trendy wydatków',
    'dashboard.categoryTrendsDesc': 'Wydatki w czasie według kategorii',
    'dashboard.chartPeriodAria': 'Pokaż dane z okresu: {period}',
    'dashboard.chartToggleCategoryAria': 'Przełącz widoczność kategorii: {category}',

    // Audit page

    // Prices page
    'nav.prices': 'Alerty cenowe',

    // Budget overview (hardcoded strings)
    'budget.overBudget': 'Przekroczono o',
    'budget.nearingLimit': 'Zbliżasz się do limitu budżetu',
    'budget.over70': 'Ponad 70% budżetu wykorzystane',
    'budget.totalSummary': 'Podsumowanie Budżetu',
    'budget.totalSpent': 'Łącznie wydano',
    'budget.totalBudget': 'Łączny budżet',
    'budget.remaining': 'Pozostało',
    'budget.overTotal': 'Przekroczono',
    'budget.used': 'wykorzystano',

    // Groups
    'nav.groups': 'Grupy',
    // Group modes
    // Group receipts

    // Groups — Quick Split & Templates

    // Settlements

    // Add expense sheet (hardcoded English)
    'addExpense.title': 'Nowy Wydatek',
    'addExpense.subtitle': 'Dodaj nowy wydatek ręcznie lub z paragonem.',
    'addExpense.description': 'Opis',
    'addExpense.descriptionPlaceholder': 'np. Obiad w restauracji',
    'addExpense.amount': 'Kwota',
    'addExpense.date': 'Data',
    'addExpense.pickDate': 'Wybierz datę',
    'addExpense.category': 'Kategoria',
    'addExpense.selectCategory': 'Wybierz kategorię',
    'addExpense.vendor': 'Sklep',
    'addExpense.optional': 'Opcjonalne',
    'addExpense.notes': 'Notatki',
    'addExpense.notesPlaceholder': 'Opcjonalna notatka...',
    'addExpense.attachReceipt': 'Dołącz paragon',
    'addExpense.uploadOrDrag': 'lub przeciągnij plik',
    'addExpense.upload': 'Prześlij',
    'addExpense.fileTooLarge': 'Plik za duży',
    'addExpense.fileTooLargeDesc': '{name} przekracza limit 10 MB.',
    'addExpense.added': 'Wydatek dodany',
    'addExpense.addedDesc': 'Twój wydatek został zapisany.',
    'addExpense.uploading': 'Przesyłanie...',
    'addExpense.saving': 'Zapisywanie...',
    'addExpense.save': 'Zapisz wydatek',
    'addExpense.failedLoadCategories': 'Nie udało się załadować kategorii',

    // Custom report form (hardcoded English)

    // Product

    // Onboarding additional

    // Navigation (new items)
    'nav.approvals': 'Zatwierdzenia',
    'nav.departments': 'Działy',
    'nav.loyalty': 'Karty lojalnościowe',
    'nav.promotions': 'Promocje',

    // Bank Connection
    // Bank page enhancements

    // Invoices (Business)

    // VAT

    // Team

    // Approvals

    // Loyalty Cards

    // Promotions

    // Weekly Summary

    // Settings additions

    // Landing page
    'landing.h1': 'Twoje finanse.',
    'landing.h1Highlight': 'Osobiste i firmowe.',
    'landing.sub': 'Solvio śledzi wydatki, skanuje paragony i faktury z AI, synchronizuje się z bankiem i daje Ci pełną kontrolę nad finansami — osobistymi i firmowymi.',
    'landing.cta': 'Zacznij za darmo',
    'landing.ctaDemo': 'Wypróbuj demo',
    'landing.trustedBy': 'Integracja z',
    'landing.twoProducts': 'Dwa produkty, jedna aplikacja',
    'landing.twoProductsSub': 'Wybierz wersję dopasowaną do Twoich potrzeb — lub korzystaj z obu.',
    'landing.personalTitle': 'Solvio Personal',
    'landing.personalSub': 'Pełna kontrola nad domowymi wydatkami',
    'landing.personalF1': 'Skanowanie paragonów (OCR)',
    'landing.personalF2': 'Synchronizacja z kontem bankowym',
    'landing.personalF3': 'Porady oszczędnościowe AI',
    'landing.personalF4': 'Dzielenie wydatków w grupach',
    'landing.personalF5': 'Porównywarka cen w sklepach',
    'landing.personalF6': 'Karty lojalnościowe i promocje',
    'landing.personalPrice': 'Za darmo',
    'landing.businessTitle': 'Solvio Business',
    'landing.businessSub': 'Finanse firmy pod kontrolą',
    'landing.businessF1': 'Skanowanie faktur VAT (OCR)',
    'landing.businessF2': 'Rozliczanie VAT i eksport JPK',
    'landing.businessF3': 'Zarządzanie zespołem i rolami',
    'landing.businessF4': 'Obieg zatwierdzeń wydatków',
    'landing.businessF5': 'Synchronizacja z kontem firmowym',
    'landing.businessF6': 'Raporty PDF/CSV/DOCX',
    'landing.businessPrice': 'Za darmo w beta',
    'landing.featuresTitle': 'Wszystko czego potrzebujesz',
    'landing.featuresSub': 'Stworzone dla ludzi, którzy chcą jasności, nie komplikacji.',
    'landing.feature1Title': 'Skanowanie AI',
    'landing.feature1Desc': 'Zrób zdjęcie paragonu lub faktury. AI wyciągnie wszystkie dane w sekundy.',
    'landing.feature2Title': 'Synchronizacja z bankiem',
    'landing.feature2Desc': 'Połącz konto PKO i automatycznie importuj transakcje.',
    'landing.feature3Title': 'Rozliczenie VAT',
    'landing.feature3Desc': 'Śledź VAT naliczony i należny. Eksportuj JPK_V7 jednym kliknięciem.',
    'landing.feature4Title': 'Inteligentne oszczędności',
    'landing.feature4Desc': 'AI analizuje wydatki i podpowiada gdzie możesz zaoszczędzić.',
    'landing.feature5Title': 'Raporty',
    'landing.feature5Desc': 'Eksportuj szczegółowe raporty PDF, CSV lub DOCX za dowolny okres.',
    'landing.feature6Title': 'Zarządzanie zespołem',
    'landing.feature6Desc': 'Zaproś pracowników, przypisz role i kontroluj limity wydatków.',
    'landing.feature7Title': 'Porównywarka cen',
    'landing.feature7Desc': 'AI porównuje ceny w Biedronce, Lidlu, Kauflandzie i Auchan.',
    'landing.feature8Title': 'Dzielenie wydatków',
    'landing.feature8Desc': 'Dziel rachunki ze znajomymi i śledź kto komu ile jest winien.',
    'landing.comparisonTitle': 'Porównanie planów',
    'landing.comparisonSub': 'Zobacz co zawiera każdy plan.',
    'landing.comparisonFeature': 'Funkcja',
    'landing.comparisonPersonal': 'Personal',
    'landing.comparisonBusiness': 'Business',
    'landing.stepsTitle': 'Jak to działa',
    'landing.step1n': '1',
    'landing.step1t': 'Wybierz plan',
    'landing.step1d': 'Personal do kontroli domowych wydatków lub Business do zarządzania firmą.',
    'landing.step2n': '2',
    'landing.step2t': 'Połącz i skanuj',
    'landing.step2d': 'Zsynchronizuj bank, skanuj paragony i faktury — AI robi resztę.',
    'landing.step3n': '3',
    'landing.step3t': 'Oszczędzaj mądrze',
    'landing.step3d': 'Czytaj raporty AI, korzystaj z alertów cenowych i optymalizuj wydatki.',
    'landing.benefits': 'Bez karty kredytowej|Polski i angielski|Tryb ciemny i jasny|Działa na telefonie|Integracja z PKO',
    'landing.ctaTitle': 'Zacznij zarządzać finansami już dziś',
    'landing.ctaSub': 'Bezpłatne konto. Bez karty kredytowej. Personal i Business w jednej aplikacji.',

    // Navigation — Goals, Budget, Challenges
    'nav.goals': 'Cele',
    'nav.budget': 'Budżet',
    'nav.challenges': 'Wyzwania',

    // Savings Goals
    'footer.tagline': 'Inteligentne śledzenie wydatków z AI.',
    'footer.signUp': 'Utwórz konto',
    'footer.logIn': 'Logowanie',
    'footer.rights': 'Wszelkie prawa zastrzeżone.',

    // Monthly Budget (new keys — budget.remaining already defined above)

    // Challenges

    // Financial health

    // Approval Card

    // Invoice Card

    // Team Member Card

    // VAT Summary Card

    // Savings Hub
    'nav.savings': 'Oszczędzanie',
    // Savings — pulpit jednoekranowy (przepływ + panele)

    // Settings — additional sections
    'settings.partiallySaved': 'Ustawienia zapisane częściowo',
    'settings.budgetSaveFailed': 'budżet(ów) nie udało się zapisać.',
    'settings.saveFailed': 'Nie udało się zapisać ustawień',
    'settings.unexpectedError': 'Nieoczekiwany błąd.',

    // Invoices — tabs

    // Expenses — tabs

    // Subscriptions
    'nav.subscriptions': 'Subskrypcje',

    // Receipt Intelligence (Analysis page)

    // Category auto-suggest (Add expense sheet)
    'addExpense.suggestedCategory': 'Sugerowana kategoria',

    // Expense Tags
    'expenses.addTag': 'Dodaj tag',
    'expenses.tags': 'Tagi',
    'expenses.filterByTag': 'Filtruj po tagu',
    'expenses.allTags': 'Wszystkie',

    // Amount range filter
    'expenses.amountFrom': 'Od (PLN)',
    'expenses.amountTo': 'Do (PLN)',
    'expenses.clearRange': 'Wyczyść zakres',
    'expenses.amountRangeActive': 'Zakres:',

    // Sort presets
    'expenses.sortBy': 'Sortuj',
    'expenses.sortNewest': 'Najnowsze',
    'expenses.sortOldest': 'Najstarsze',
    'expenses.sortHighest': 'Najwyższe',
    'expenses.sortLowest': 'Najniższe',

    // Bulk delete inline confirmation
    'expenses.bulkDeleteConfirmPrompt': 'Usunąć zaznaczone?',
    'expenses.bulkDeleteConfirmYes': 'Usuń',

    // Merchant rules (auto-categorization)
    'addExpense.autoAppliedCategory': 'Auto-aplikowana',
    'addExpense.autoAppliedHint': 'bazując na historii',
    'addExpense.clearAutoCategory': 'Wyczyść auto-kategorię',

    // Accessibility — aria-labels
    'addExpense.removeFile': 'Usuń plik',
    'receipts.editItem': 'Edytuj pozycję',
    'receipts.removeFile': 'Usuń plik',
    'expenses.saveItem': 'Zapisz pozycję',
    'expenses.cancelEditItem': 'Anuluj edycję pozycji',
    'expenses.editItem': 'Edytuj pozycję',
    'common.toggleSidebar': 'Przełącz panel boczny',
    'expenses.saved': 'Wydatek zapisany',
    'expenses.deleted': 'Wydatek usunięty',
    'errors.saveFailed': 'Nie udało się zapisać',
    'errors.fetchExpenses': 'Nie udało się pobrać wydatków',
    'addExpense.amountPlaceholder': 'np. 25,90',
  },
  en: {
    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.add': 'Add',
    
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.expenses': 'Expenses',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    
    // Dashboard
    'dashboard.transactions': 'transactions',
    'dashboard.perDay': 'per day average',
    'dashboard.budgetProgress': 'Budget Progress',
    'dashboard.over': 'over',
    'dashboard.budget': 'budget',
    'dashboard.recentActivity': 'Recent Activity',
    'dashboard.topCategories': 'Top Categories',
    'dashboard.biggestPurchase': 'Biggest Purchase',
    'dashboard.viewAllExpenses': 'View All Expenses',
    
    // Expenses
    'expenses.title': 'Expenses',
    'expenses.amount': 'Amount',
    'expenses.category': 'Category',
    'expenses.actions': 'Actions',
    'expenses.receiptItems': 'Receipt Items',
    'expenses.noExpenses': 'No expenses found',
    'expenses.noItems': 'No items found',
    'expenses.titleCol': 'Title',
    'expenses.delete': 'Delete',
    'expenses.deleting': 'Deleting...',
    'expenses.noCategory': 'No category',
    'expenses.price': 'Price',
    'expenses.selectAll': 'Select all',
    'expenses.retry': 'Retry',
    'expenses.viewReceipt': 'View receipt',
    'expenses.saveEdit': 'Save changes',
    'expenses.editExpense': 'Edit expense',
    'expenses.receiptImage': 'Receipt Image',
    'expenses.noImage': 'No image available',
    'expenses.noExpensesTitle': 'No expenses yet',
    'expenses.noExpensesDesc': 'Start by scanning a receipt or adding an expense manually.',
    'expenses.confirmDelete': 'Confirm deletion',
    'expenses.confirmDeleteDesc': 'Are you sure you want to delete',
    'expenses.confirmBulkDelete': 'Delete selected',
    'expenses.confirmBulkDeleteDesc': 'Are you sure you want to delete the selected expenses? This cannot be undone.',
    'expenses.searchPlaceholder': 'Search expenses...',
    'expenses.filterCategory': 'Filter category',
    'expenses.allCategories': 'All categories',
    'expenses.clearFilters': 'Clear filters',
    'expenses.noReceiptAttached': 'No receipt attached',
    'expenses.itemName': 'Item name',
    'expenses.titleRequired': 'Title is required',
    'expenses.amountRequired': 'Amount must be greater than 0',
    'expenses.itemNameRequired': 'Name is required',
    'expenses.itemPriceRequired': 'Price must be greater than 0',
    'expenses.dateFrom': 'Date from',
    'expenses.dateTo': 'Date to',
    'expenses.exportCsv': 'Export CSV',
    'expenses.sortAsc': 'Ascending',
    'expenses.sortDesc': 'Descending',
    'expenses.page': 'Page',
    'expenses.of': 'of',
    'expenses.prevPage': 'Previous',
    'expenses.nextPage': 'Next',
    'expenses.showing': 'Showing',
    'expenses.results': 'results',
    'expenses.copyLink': 'Copy share link',
    'expenses.linkCopied': 'Copied!',
    'expenses.qrCode': 'QR Code',
    'expenses.openReceipt': 'Open',
    'expenses.viewEReceipt': 'View e-receipt',
    'expenses.scanQr': 'Scan to open receipt',
    'expenses.selectToPreview': 'Select an expense from the list to see details',
    'expenses.moreFilters': 'More filters',

    // Categories
    'categories.food': 'Food',
    'categories.groceries': 'Groceries',
    'categories.health': 'Health',
    'categories.transport': 'Transport',
    'categories.shopping': 'Shopping',
    'categories.electronics': 'Electronics',
    'categories.homeGarden': 'Home & Garden',
    'categories.entertainment': 'Entertainment',
    'categories.billsUtilities': 'Bills & Utilities',
    'categories.other': 'Other',
    
    // Settings
    'settings.language': 'Language',
    'settings.currency': 'Default currency',
    'settings.currencySubtitle': 'Used when adding expenses manually. Receipts detect currency automatically.',
    'settings.defaultCategories': 'Default Categories',
    'settings.loadDefaults': 'Load Defaults',
    'settings.loadingDefaults': 'Updating...',
    'settings.defaultCategoriesDesc': 'Load 10 default categories: Food, Groceries, Health, Transport, Shopping, Electronics, Home & Garden, Entertainment, Bills & Utilities, Other',
    'settings.categoryName': 'Category Name',
    'settings.noCategories': 'No categories yet. Add your first category above.',
    'settings.noCategoriesForBudget': 'No categories available. Add categories in the section below first.',
    'settings.deleteCategory': 'Delete Category?',
    'settings.deleteCategoryDesc': 'This will remove the category. Existing expenses with this category will keep it, but you won\'t be able to assign it to new expenses.',
    'settings.saved': 'Settings saved',
    'settings.savedDesc': 'Your preferences and budgets have been updated.',
    'settings.categoriesSeedFailed': 'Failed to seed categories',
    'settings.unknownError': 'Unknown error',
    'settings.categoriesUpdated': 'Categories updated!',
    'settings.categoriesUpdatedDesc': 'Default categories have been loaded.',
    'settings.categoryNameRequired': 'Category name is required',
    'settings.categoryAdded': 'Category added successfully',
    'settings.categoryAddFailed': 'Failed to add category',
    'settings.categoryNameEmpty': 'Category name cannot be empty',
    'settings.categoryUpdated': 'Category updated',
    'settings.categoryUpdateFailed': 'Failed to update category',
    'settings.categoryDeleted': 'Category deleted',
    'settings.categoryDeleteFailed': 'Failed to delete category',
    'settings.categoryNamePlaceholder': 'Category name (e.g., Electronics, Food)',
    'settings.icon': 'Icon',

    // Reports
    
    // Receipts
    'receipts.scan': 'Scan Receipt',
    'receipts.add': 'Add Expense',
    'receipts.duplicate': 'Duplicate Receipt',
    'receipts.processing': 'Processing...',
    'receipts.completed': 'Scanning completed',
    'receipts.completedDesc': 'Receipt data has been read.',
    'receipts.error': 'Error',
    'receipts.addFile': 'Add file',
    'receipts.selectFiles': 'Select files (JPG, PNG, HEIC)',
    'receipts.maxSize': 'Max size: 4MB per file',
    'receipts.partialSuccess': 'Partial success',
    'receipts.allDuplicates': 'All receipts are duplicates',
    'receipts.takePhoto': 'Take Photo',
    'receipts.viewEReceipt': 'View e-receipt',
    'receipts.addFileFirst': 'Add at least one file.',
    'receipts.ocrError': 'OCR returned an error.',
    'receipts.requestTooLarge': 'Request too large',
    'receipts.formatError': 'Format error',
    'receipts.duplicateReceipt': 'Duplicate receipt',
    'receipts.duplicateReceiptDesc': 'This receipt was already added.',
    'receipts.invalidResponse': 'Invalid server response.',
    'receipts.scanComplete': 'Scanning complete',
    'receipts.scanError': 'Scanning error.',
    'receipts.reviewItems': 'Review Receipt Items',
    'receipts.noItemsDisplay': 'No items to display.',
    'receipts.product': 'Item',
    'receipts.itemPrice': 'Price',
    'receipts.itemNamePlaceholder': 'Item name',
    'receipts.categoryPlaceholder': 'Category',
    'receipts.newScan': 'New Receipt Scan',
    'receipts.click': 'Click',
    'receipts.dragDrop': 'or drag & drop files here',
    'receipts.selectedFiles': 'Selected files',
    'receipts.processingReceipt': 'Processing receipt...',
    'receipts.tryAgain': 'Try again',
    'receipts.discard': 'Discard',
    'receipts.saveAndClose': 'Save & Close',

    // Analysis & Audit
    'nav.analysis': 'AI Analysis',
    'nav.audit': 'Shopping Audit',
    'analysis.refreshAi': 'Refresh AI',

    // Auth
    'auth.signIn': 'Sign In',
    'auth.signUp': 'Sign Up',

    // Sidebar
    'nav.navigation': 'Navigation',
    'nav.signOut': 'Sign out',
    'nav.darkMode': 'Dark mode',
    'nav.lightMode': 'Light mode',
    'nav.bank': 'Bank',
    'nav.invoices': 'Invoices',
    'nav.vat': 'VAT',
    'nav.team': 'Team',
    'nav.personal': 'Personal',
    'nav.business': 'Business',

    // Keyboard shortcuts
    'shortcuts.label': 'Keyboard shortcuts',
    'shortcuts.open': 'Open keyboard shortcuts',
    'shortcuts.then': 'then',

    // Dashboard additional
    'dashboard.failedLoad': 'Failed to load dashboard',
    'dashboard.failedLoadDesc': 'An error occurred while fetching your financial data. Check your connection and try again.',
    'dashboard.tryAgain': 'Try again',
    'dashboard.day': 'day',
    'dashboard.noCategoryData': 'No category data yet.',
    'dashboard.vsLastMonth': 'vs last month',
    'dashboard.thisWeek': 'This Week',
    'dashboard.savingsRate': 'Savings rate',
    'dashboard.forecastMonth': 'Monthly forecast',
    'dashboard.monthSpending': 'Spent this month',
    'dashboard.monthBalance': 'Month balance',
    'dashboard.addIncome': 'Add your income',
    'dashboard.paceMarker': 'mark = ideal pace',
    'dashboard.dailyAllowance': 'Daily allowance',
    'dashboard.daysLeft': 'days left',
    'dashboard.categorySplit': 'Spending split',
    'dashboard.vsPrevMonth': 'vs previous month',
    'dashboard.comparisonHint': 'solid = this month · faded = previous',
    'dashboard.oneOffNew': 'new / one-off',
    'dashboard.remainingBudget': 'left',
    'dashboard.goodMorning': 'Good morning',
    'dashboard.overBudgetShort': 'over by',
    'dashboard.nearLimitShort': 'near limit',
    'dashboard.wellnessScore': 'Financial Health',
    'dashboard.wellnessGrade': 'Grade',
    'dashboard.wellnessSavings': 'Savings',
    'dashboard.wellnessBudget': 'Budget',
    'dashboard.wellnessTrend': 'Spend Trend',
    'dashboard.wellnessExcellent': 'Excellent',
    'dashboard.wellnessGood': 'Good',
    'dashboard.wellnessFair': 'Fair',
    'dashboard.wellnessPoor': 'Poor',
    'dashboard.wellnessBad': 'Bad',

    // Onboarding empty state
    'onboarding.title': 'Welcome to Solvio!',
    'onboarding.subtitle': 'Start tracking your finances in 3 simple steps',
    'onboarding.step1.badge': 'Step 1',
    'onboarding.step1.title': 'Categories ready',
    'onboarding.step1.desc': 'Your default categories are already loaded — Food, Transport, Health and more.',
    'onboarding.step1.action': 'Manage categories',
    'onboarding.step2.badge': 'Step 2',
    'onboarding.step2.title': 'Add your first expense',
    'onboarding.step2.desc': 'Scan a receipt with your camera or enter an expense manually. AI will automatically assign a category.',
    'onboarding.step3.badge': 'Step 3',
    'onboarding.step3.title': 'Discover financial insights',
    'onboarding.step3.desc': "Once you add expenses, you'll see charts, AI analysis and PDF reports — all generated automatically.",
    'onboarding.step3.action': 'Go to AI Analysis',
    'onboarding.privacy': 'Your data is safe and private — always.',
    'onboarding.categoriesReady': 'Categories loaded',

    // Onboarding product selection

    // Analysis page (hardcoded strings)

    // Dashboard weekly digest
    'dashboard.weeklyDigest': 'Weekly Digest',
    'dashboard.weeklyDigestDesc': 'AI-generated summary of your last 7 days',
    'dashboard.generateWeeklySummary': 'Generate weekly summary',
    'dashboard.weeklyGenerating': 'Generating summary…',
    'dashboard.weeklyNoData': 'No expenses in the last 7 days.',
    'dashboard.weeklyError': 'Failed to generate summary.',
    'dashboard.categoryTrends': 'Spending Trends',
    'dashboard.categoryTrendsDesc': 'Spending over time by category',
    'dashboard.chartPeriodAria': 'Show data for period: {period}',
    'dashboard.chartToggleCategoryAria': 'Toggle category visibility: {category}',

    // Audit page

    // Prices page
    'nav.prices': 'Price Alerts',

    // Budget overview (hardcoded strings)
    'budget.overBudget': 'Over budget by',
    'budget.nearingLimit': 'Nearing budget limit',
    'budget.over70': 'Over 70% of budget used',
    'budget.totalSummary': 'Budget Summary',
    'budget.totalSpent': 'Total spent',
    'budget.totalBudget': 'Total budget',
    'budget.remaining': 'Remaining',
    'budget.overTotal': 'Over budget',
    'budget.used': 'used',

    // Groups
    'nav.groups': 'Groups',
    // Group modes
    // Group receipts

    // Groups — Quick Split & Templates

    // Settlements

    // Add expense sheet (hardcoded English)
    'addExpense.title': 'New Expense',
    'addExpense.subtitle': 'Add a new expense manually or with a receipt.',
    'addExpense.description': 'Description',
    'addExpense.descriptionPlaceholder': 'e.g., Lunch at restaurant',
    'addExpense.amount': 'Amount',
    'addExpense.date': 'Date',
    'addExpense.pickDate': 'Pick a date',
    'addExpense.category': 'Category',
    'addExpense.selectCategory': 'Select category',
    'addExpense.vendor': 'Vendor',
    'addExpense.optional': 'Optional',
    'addExpense.notes': 'Notes',
    'addExpense.notesPlaceholder': 'Optional note...',
    'addExpense.attachReceipt': 'Attach receipt',
    'addExpense.uploadOrDrag': 'or drag file',
    'addExpense.upload': 'Upload',
    'addExpense.fileTooLarge': 'File too large',
    'addExpense.fileTooLargeDesc': '{name} exceeds the 10 MB limit.',
    'addExpense.added': 'Expense added',
    'addExpense.addedDesc': 'Your expense has been saved.',
    'addExpense.uploading': 'Uploading...',
    'addExpense.saving': 'Saving...',
    'addExpense.save': 'Save expense',
    'addExpense.failedLoadCategories': 'Failed to load categories',

    // Custom report form (hardcoded English)

    // Product

    // Onboarding additional

    // Navigation (new items)
    'nav.approvals': 'Approvals',
    'nav.departments': 'Departments',
    'nav.loyalty': 'Loyalty Cards',
    'nav.promotions': 'Promotions',

    // Bank Connection
    // Bank page enhancements

    // Invoices (Business)

    // VAT

    // Team

    // Approvals

    // Loyalty Cards

    // Promotions

    // Weekly Summary

    // Settings additions

    // Landing page
    'landing.h1': 'Your finances.',
    'landing.h1Highlight': 'Personal and business.',
    'landing.sub': 'Solvio tracks expenses, scans receipts and invoices with AI, syncs with your bank and gives you full control over your finances — personal and business.',
    'landing.cta': 'Start for free',
    'landing.ctaDemo': 'Try demo',
    'landing.trustedBy': 'Integrates with',
    'landing.twoProducts': 'Two products, one app',
    'landing.twoProductsSub': 'Choose the plan that fits your needs — or use both.',
    'landing.personalTitle': 'Solvio Personal',
    'landing.personalSub': 'Full control over household expenses',
    'landing.personalF1': 'Receipt scanning (OCR)',
    'landing.personalF2': 'Bank account sync',
    'landing.personalF3': 'AI savings tips',
    'landing.personalF4': 'Group expense splitting',
    'landing.personalF5': 'Store price comparison',
    'landing.personalF6': 'Loyalty cards & promotions',
    'landing.personalPrice': 'Free',
    'landing.businessTitle': 'Solvio Business',
    'landing.businessSub': 'Company finances under control',
    'landing.businessF1': 'VAT invoice scanning (OCR)',
    'landing.businessF2': 'VAT tracking & JPK export',
    'landing.businessF3': 'Team management & roles',
    'landing.businessF4': 'Expense approval workflow',
    'landing.businessF5': 'Business bank account sync',
    'landing.businessF6': 'PDF/CSV/DOCX reports',
    'landing.businessPrice': 'Free in beta',
    'landing.featuresTitle': 'Everything you need',
    'landing.featuresSub': 'Built for people who want clarity, not complexity.',
    'landing.feature1Title': 'AI Scanning',
    'landing.feature1Desc': 'Snap a photo of a receipt or invoice. AI extracts all data in seconds.',
    'landing.feature2Title': 'Bank Sync',
    'landing.feature2Desc': 'Connect your PKO account and automatically import transactions.',
    'landing.feature3Title': 'VAT Tracking',
    'landing.feature3Desc': 'Track input and output VAT. Export JPK_V7 with one click.',
    'landing.feature4Title': 'Smart Savings',
    'landing.feature4Desc': 'AI analyzes your spending and suggests where you can save.',
    'landing.feature5Title': 'Reports',
    'landing.feature5Desc': 'Export detailed PDF, CSV or DOCX reports for any period.',
    'landing.feature6Title': 'Team Management',
    'landing.feature6Desc': 'Invite employees, assign roles and control spending limits.',
    'landing.feature7Title': 'Price Comparison',
    'landing.feature7Desc': 'AI compares prices across Biedronka, Lidl, Kaufland and Auchan.',
    'landing.feature8Title': 'Expense Splitting',
    'landing.feature8Desc': 'Split bills with friends and track who owes what.',
    'landing.comparisonTitle': 'Plan comparison',
    'landing.comparisonSub': 'See what each plan includes.',
    'landing.comparisonFeature': 'Feature',
    'landing.comparisonPersonal': 'Personal',
    'landing.comparisonBusiness': 'Business',
    'landing.stepsTitle': 'How it works',
    'landing.step1n': '1',
    'landing.step1t': 'Choose your plan',
    'landing.step1d': 'Personal for household spending or Business for company management.',
    'landing.step2n': '2',
    'landing.step2t': 'Connect & scan',
    'landing.step2d': 'Sync your bank, scan receipts and invoices — AI does the rest.',
    'landing.step3n': '3',
    'landing.step3t': 'Save smarter',
    'landing.step3d': 'Read AI reports, use price alerts and optimize your spending.',
    'landing.benefits': 'No credit card required|Polish & English|Dark & light mode|Mobile friendly|PKO integration',
    'landing.ctaTitle': 'Start managing your finances today',
    'landing.ctaSub': 'Free account. No credit card. Personal and Business in one app.',

    // Navigation — Goals, Budget, Challenges
    'nav.goals': 'Goals',
    'nav.budget': 'Budget',
    'nav.challenges': 'Challenges',

    // Savings Goals
    'footer.tagline': 'Smart expense tracking powered by AI.',
    'footer.signUp': 'Sign Up',
    'footer.logIn': 'Log In',
    'footer.rights': 'All rights reserved.',

    // Monthly Budget (new keys — budget.remaining already defined above)

    // Challenges

    // Financial health

    // Approval Card

    // Invoice Card

    // Team Member Card

    // VAT Summary Card

    // Savings Hub
    'nav.savings': 'Savings',
    // Savings — single-screen dashboard (flow + panels)

    // Settings — additional sections
    'settings.partiallySaved': 'Settings partially saved',
    'settings.budgetSaveFailed': 'budget(s) failed to save.',
    'settings.saveFailed': 'Failed to save settings',
    'settings.unexpectedError': 'Unexpected error.',

    // Invoices — tabs

    // Expenses — tabs

    // Subscriptions
    'nav.subscriptions': 'Subscriptions',

    // Receipt Intelligence (Analysis page)

    // Category auto-suggest (Add expense sheet)
    'addExpense.suggestedCategory': 'Suggested category',

    // Expense Tags
    'expenses.addTag': 'Add tag',
    'expenses.tags': 'Tags',
    'expenses.filterByTag': 'Filter by tag',
    'expenses.allTags': 'All',

    // Amount range filter
    'expenses.amountFrom': 'From (PLN)',
    'expenses.amountTo': 'To (PLN)',
    'expenses.clearRange': 'Clear range',
    'expenses.amountRangeActive': 'Range:',

    // Sort presets
    'expenses.sortBy': 'Sort by',
    'expenses.sortNewest': 'Newest first',
    'expenses.sortOldest': 'Oldest first',
    'expenses.sortHighest': 'Highest first',
    'expenses.sortLowest': 'Lowest first',

    // Bulk delete inline confirmation
    'expenses.bulkDeleteConfirmPrompt': 'Delete selected?',
    'expenses.bulkDeleteConfirmYes': 'Delete',

    // Merchant rules (auto-categorization)
    'addExpense.autoAppliedCategory': 'Auto-applied',
    'addExpense.autoAppliedHint': 'based on history',
    'addExpense.clearAutoCategory': 'Clear auto-category',

    // Accessibility — aria-labels
    'addExpense.removeFile': 'Remove file',
    'receipts.editItem': 'Edit item',
    'receipts.removeFile': 'Remove file',
    'expenses.saveItem': 'Save item',
    'expenses.cancelEditItem': 'Cancel item edit',
    'expenses.editItem': 'Edit item',
    'common.toggleSidebar': 'Toggle sidebar',
    'expenses.saved': 'Expense saved',
    'expenses.deleted': 'Expense deleted',
    'errors.saveFailed': 'Failed to save',
    'errors.fetchExpenses': 'Failed to fetch expenses',
    'addExpense.amountPlaceholder': 'e.g., 25.90',
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

  const translate = React.useCallback((key: string): string => {
    // During SSR and first render, always return English
    const langToUse = mounted ? currentLang : 'en'
    return translations[langToUse][key as keyof typeof translations[typeof langToUse]] || key
  }, [mounted, currentLang])

  return { t: translate, lang: currentLang, changeLanguage, mounted }
}

// Import React for hook
import React from 'react'
