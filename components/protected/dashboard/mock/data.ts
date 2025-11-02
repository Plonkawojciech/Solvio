// Te dane zasilają pola <Select> w formularzu.
// W przyszłości powinieneś pobierać je z bazy danych
// i pozwolić użytkownikowi na ich edycję na stronie Ustawień.

export const MOCK_CATEGORIES = [
  { value: 'food', label: 'Food', icon: '🍔' },
  { value: 'transport', label: 'Transport', icon: '🚌' },
  { value: 'groceries', label: 'Groceries', icon: '🛒' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎉' },
  { value: 'utilities', label: 'Utilities', icon: '🧾' },
  { value: 'housing', label: 'Housing', icon: '🏠' },
  { value: 'clothing', label: 'Clothing', icon: '👕' },
  { value: 'health', label: 'Health', icon: '💊' },
  { value: 'other', label: 'Other', icon: '🤷‍♂️' },
]

export const MOCK_PAYMENT_METHODS = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'blik', label: 'BLIK' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]
