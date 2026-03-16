import { neon } from '@neondatabase/serverless'

const DATABASE_URL = 'postgresql://neondb_owner:npg_0KcEhFRt7HvN@ep-icy-thunder-ag5lsd1q.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
const DEMO_USER_ID = 'u_9e8afcb57c7629566eeedf8aa44aa05b'

const sql = neon(DATABASE_URL)

// Helper: date N days ago
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  // 1. Get category IDs for this user
  const cats = await sql`SELECT id, name FROM categories WHERE user_id = ${DEMO_USER_ID}`
  const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]))
  console.log('Categories found:', Object.keys(catMap))

  // Helper: get category ID by name
  const cat = (name) => catMap[name] || catMap['Other'] || null

  // 2. Clear existing expenses for demo user
  await sql`DELETE FROM expenses WHERE user_id = ${DEMO_USER_ID}`
  console.log('Cleared existing demo expenses')

  // 3. Insert realistic Polish expenses (last 60 days)
  const expenses = [
    // Food / Restaurants
    { title: 'Obiad w restauracji', amount: '68.50', date: daysAgo(1), category: 'Food', vendor: 'Restauracja Polska' },
    { title: 'Kawa i ciasto', amount: '32.00', date: daysAgo(2), category: 'Food', vendor: 'Costa Coffee' },
    { title: 'Lunch z kolegami', amount: '54.90', date: daysAgo(4), category: 'Food', vendor: 'Kuchnia Polska' },
    { title: 'Pizza na wynos', amount: '48.00', date: daysAgo(7), category: 'Food', vendor: 'Pizzeria Roma' },
    { title: 'Kebab', amount: '24.00', date: daysAgo(9), category: 'Food', vendor: 'Istanbul Kebab' },
    { title: 'Sushi delivery', amount: '89.90', date: daysAgo(14), category: 'Food', vendor: 'SushiMaster' },
    { title: 'Kawiarnia śniadanie', amount: '41.00', date: daysAgo(19), category: 'Food', vendor: 'Cafe Nero' },
    { title: 'Obiad biznesowy', amount: '127.00', date: daysAgo(22), category: 'Food', vendor: 'Restauracja Wilanów' },
    { title: 'Burger', amount: '35.90', date: daysAgo(28), category: 'Food', vendor: 'Burger King' },
    { title: 'Lunch box', amount: '19.90', date: daysAgo(31), category: 'Food', vendor: 'Subway' },
    { title: 'Kolacja we dwoje', amount: '156.00', date: daysAgo(36), category: 'Food', vendor: 'Restauracja Nowa' },
    { title: 'Kawa na wynos', amount: '15.50', date: daysAgo(40), category: 'Food', vendor: 'Starbucks' },

    // Groceries
    { title: 'Zakupy tygodniowe', amount: '234.67', date: daysAgo(2), category: 'Groceries', vendor: 'Biedronka' },
    { title: 'Warzywa i owoce', amount: '67.30', date: daysAgo(5), category: 'Groceries', vendor: 'Lidl' },
    { title: 'Zakupy spożywcze', amount: '189.40', date: daysAgo(9), category: 'Groceries', vendor: 'Kaufland' },
    { title: 'Artykuły przemysłowe', amount: '45.90', date: daysAgo(12), category: 'Groceries', vendor: 'Żabka' },
    { title: 'Mięso i wędliny', amount: '88.50', date: daysAgo(16), category: 'Groceries', vendor: 'Carrefour' },
    { title: 'Zakupy weekendowe', amount: '312.80', date: daysAgo(20), category: 'Groceries', vendor: 'Biedronka' },
    { title: 'Napoje i przekąski', amount: '54.20', date: daysAgo(24), category: 'Groceries', vendor: 'Lidl' },
    { title: 'Produkty mleczne', amount: '38.40', date: daysAgo(27), category: 'Groceries', vendor: 'Auchan' },
    { title: 'Zakupy miesięczne', amount: '445.60', date: daysAgo(32), category: 'Groceries', vendor: 'Kaufland' },
    { title: 'Pieczywo i nabiał', amount: '29.80', date: daysAgo(37), category: 'Groceries', vendor: 'Żabka' },
    { title: 'Artykuły czyszczące', amount: '78.90', date: daysAgo(42), category: 'Groceries', vendor: 'Rossmann' },
    { title: 'Warzywa ekologiczne', amount: '56.30', date: daysAgo(48), category: 'Groceries', vendor: 'Organic Shop' },

    // Transport
    { title: 'Paliwo', amount: '320.00', date: daysAgo(3), category: 'Transport', vendor: 'Orlen' },
    { title: 'Bilet miesięczny ZTM', amount: '110.00', date: daysAgo(5), category: 'Transport', vendor: 'ZTM Warszawa' },
    { title: 'Uber', amount: '28.50', date: daysAgo(8), category: 'Transport', vendor: 'Uber' },
    { title: 'Paliwo', amount: '285.60', date: daysAgo(13), category: 'Transport', vendor: 'Shell' },
    { title: 'Parking śródmieście', amount: '24.00', date: daysAgo(17), category: 'Transport', vendor: 'Parkeon' },
    { title: 'Bolt taxi', amount: '19.90', date: daysAgo(21), category: 'Transport', vendor: 'Bolt' },
    { title: 'Pociąg Warszawa-Kraków', amount: '89.00', date: daysAgo(25), category: 'Transport', vendor: 'PKP Intercity' },
    { title: 'Paliwo', amount: '298.40', date: daysAgo(33), category: 'Transport', vendor: 'Orlen' },
    { title: 'Przegląd techniczny', amount: '250.00', date: daysAgo(45), category: 'Transport', vendor: 'Bosch Serwis' },

    // Health
    { title: 'Apteka — leki', amount: '87.60', date: daysAgo(6), category: 'Health', vendor: 'Apteka DOZ' },
    { title: 'Wizyta u lekarza', amount: '200.00', date: daysAgo(10), category: 'Health', vendor: 'LuxMed' },
    { title: 'Siłownia — karnet', amount: '129.00', date: daysAgo(15), category: 'Health', vendor: 'FitFabric' },
    { title: 'Suplemety diety', amount: '148.90', date: daysAgo(23), category: 'Health', vendor: 'Olimp Sport Nutrition' },
    { title: 'Stomatolog', amount: '450.00', date: daysAgo(38), category: 'Health', vendor: 'Dentist Plus' },
    { title: 'Fizjoterapeuta', amount: '180.00', date: daysAgo(50), category: 'Health', vendor: 'RehabMed' },

    // Shopping
    { title: 'Buty sportowe', amount: '349.00', date: daysAgo(3), category: 'Shopping', vendor: 'Nike' },
    { title: 'Koszule do pracy', amount: '289.90', date: daysAgo(11), category: 'Shopping', vendor: 'Reserved' },
    { title: 'Kosmetyki', amount: '156.40', date: daysAgo(18), category: 'Shopping', vendor: 'Sephora' },
    { title: 'Jeans', amount: '229.00', date: daysAgo(26), category: 'Shopping', vendor: 'Zara' },
    { title: 'Akcesoria do kuchni', amount: '189.90', date: daysAgo(34), category: 'Shopping', vendor: 'IKEA' },
    { title: 'Plecak', amount: '199.00', date: daysAgo(43), category: 'Shopping', vendor: 'CCC' },
    { title: 'Odzież sportowa', amount: '267.80', date: daysAgo(55), category: 'Shopping', vendor: 'Adidas' },

    // Electronics
    { title: 'Słuchawki bezprzewodowe', amount: '699.00', date: daysAgo(8), category: 'Electronics', vendor: 'Media Expert' },
    { title: 'Kabel USB-C', amount: '49.90', date: daysAgo(16), category: 'Electronics', vendor: 'x-kom' },
    { title: 'Powerbank', amount: '129.00', date: daysAgo(29), category: 'Electronics', vendor: 'Saturn' },
    { title: 'Klawiatura mechaniczna', amount: '389.00', date: daysAgo(47), category: 'Electronics', vendor: 'Komputronik' },

    // Entertainment
    { title: 'Netflix — miesięczny', amount: '49.00', date: daysAgo(4), category: 'Entertainment', vendor: 'Netflix' },
    { title: 'Spotify Premium', amount: '23.99', date: daysAgo(4), category: 'Entertainment', vendor: 'Spotify' },
    { title: 'Kino', amount: '58.00', date: daysAgo(13), category: 'Entertainment', vendor: 'Multikino' },
    { title: 'Escape room', amount: '120.00', date: daysAgo(20), category: 'Entertainment', vendor: 'Adventure Rooms' },
    { title: 'Koncert', amount: '180.00', date: daysAgo(35), category: 'Entertainment', vendor: 'Ticketmaster' },
    { title: 'Książki', amount: '67.90', date: daysAgo(41), category: 'Entertainment', vendor: 'Empik' },
    { title: 'Steam — gra', amount: '79.99', date: daysAgo(52), category: 'Entertainment', vendor: 'Steam' },

    // Bills & Utilities
    { title: 'Prąd', amount: '287.40', date: daysAgo(6), category: 'Bills & Utilities', vendor: 'Energa' },
    { title: 'Internet', amount: '79.99', date: daysAgo(6), category: 'Bills & Utilities', vendor: 'Orange' },
    { title: 'Telefon komórkowy', amount: '89.99', date: daysAgo(6), category: 'Bills & Utilities', vendor: 'Play' },
    { title: 'Czynsz za mieszkanie', amount: '2800.00', date: daysAgo(7), category: 'Bills & Utilities', vendor: 'Spółdzielnia Mieszkaniowa' },
    { title: 'Woda i ogrzewanie', amount: '234.50', date: daysAgo(8), category: 'Bills & Utilities', vendor: 'MPWiK' },
    { title: 'Ubezpieczenie OC', amount: '156.00', date: daysAgo(38), category: 'Bills & Utilities', vendor: 'PZU' },
  ]

  let inserted = 0
  for (const e of expenses) {
    const categoryId = cat(e.category)
    await sql`
      INSERT INTO expenses (user_id, title, amount, currency, date, category_id, vendor)
      VALUES (${DEMO_USER_ID}, ${e.title}, ${e.amount}, 'PLN', ${e.date}, ${categoryId}, ${e.vendor})
    `
    inserted++
  }

  console.log(`✓ Inserted ${inserted} expenses for demo user`)

  // 4. Set some budgets
  const budgetsToSet = [
    { category: 'Food', amount: '600' },
    { category: 'Groceries', amount: '1200' },
    { category: 'Transport', amount: '600' },
    { category: 'Health', amount: '400' },
    { category: 'Shopping', amount: '800' },
    { category: 'Entertainment', amount: '300' },
    { category: 'Bills & Utilities', amount: '4000' },
  ]

  for (const b of budgetsToSet) {
    const categoryId = cat(b.category)
    if (!categoryId) continue
    await sql`
      INSERT INTO category_budgets (user_id, category_id, amount, period)
      VALUES (${DEMO_USER_ID}, ${categoryId}, ${b.amount}, 'monthly')
      ON CONFLICT (user_id, category_id, period) DO UPDATE SET amount = ${b.amount}
    `
  }
  console.log('✓ Set category budgets')

  console.log('\nDone! Demo account seeded.')
}

main().catch(console.error)
