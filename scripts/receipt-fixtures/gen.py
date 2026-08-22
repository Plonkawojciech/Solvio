#!/usr/bin/env python3
"""Generator syntetycznych paragonów do testów OCR.

Po co: nie mamy zbioru prawdziwych zdjęć paragonów z opisaną prawdą, a bez
niego „poprawiłem OCR" jest opinią, nie pomiarem. Skrypt renderuje paragony
w układzie polskiego wydruku fiskalnego, dokłada szum typowy dla zdjęcia
termiki (przekrzywienie, ziarno, spadek kontrastu, winieta) i zapisuje obok
JSON z prawdą — sprzedawca, data, suma, waluta, pozycje.

Deterministyczny: ziarno losowe jest stałe na paragon, więc ta sama komenda
daje bajt w bajt te same pliki i benchmark porównuje modele, nie losowanie.

    python3 scripts/receipt-fixtures/gen.py

Wyniki: tests/fixtures/receipts/<slug>.jpg + <slug>.json
"""

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "fixtures" / "receipts"
FONT_PATH = "/System/Library/Fonts/Menlo.ttc"

WIDTH = 620          # szerokość „taśmy" w pikselach
MARGIN = 34
LINE = 26
FONT_SIZE = 19

# --- Dane paragonów -----------------------------------------------------------
# Pozycja: (nazwa na wydruku, ilość, cena jednostkowa)
# Nazwy celowo bez polskich znaków i skrócone — tak drukuje większość kas.

RECEIPTS = [
    {
        "slug": "biedronka-12-pozycji",
        "note": "Duży paragon spożywczy z rabatami — najczęstszy przypadek.",
        "merchant": "Biedronka",
        "header": [
            "BIEDRONKA 3421",
            "Jeronimo Martins Polska S.A.",
            "ul. Zniwna 5, 61-478 Poznan",
            "NIP 779-10-11-327",
        ],
        "date": "2026-08-14",
        "time": "17:42",
        "currency": "PLN",
        "payment": "Karta",
        "items": [
            ("Chleb zytni krojony 500g", 1, 4.49),
            ("Mleko Laciate 3,2% 1L", 2, 3.79),
            ("Maslo Polskie 200g", 1, 8.99),
            ("Jaja L 10szt", 1, 12.49),
            ("Piers z kurczaka kg", 0.842, 24.90),
            ("Pomidory malinowe kg", 0.615, 12.99),
            ("Banany kg", 1.240, 6.49),
            ("Jogurt naturalny 400g", 3, 2.99),
            ("Papier toaletowy 8szt", 1, 14.99),
            ("Woda niegaz. 1,5L", 6, 1.89),
            ("Kawa Tchibo Gold 250g", 1, 26.99),
            ("Czekolada Wedel 100g", 2, 4.29),
        ],
        "discounts": [("RABAT Karta Moja Biedronka", -4.50)],
    },
    {
        "slug": "lidl-skroty-i-rabaty",
        "note": "Skróty POS-owe i rabaty Lidl Plus — test rozwijania nazw.",
        "merchant": "Lidl",
        "header": [
            "LIDL sp. z o.o. sp. k.",
            "ul. Poznanska 48, Jankowice",
            "62-080 Tarnowo Podgorne",
            "NIP 781-18-96-085",
        ],
        "date": "2026-08-09",
        "time": "11:08",
        "currency": "PLN",
        "payment": "BLIK",
        "items": [
            ("PILOSJOG NAT 400G", 2, 2.49),
            ("CHLEZYTN ORKISZ", 1, 5.99),
            ("MILBONA MASLO EX", 1, 9.49),
            ("COMBINO MAKARON", 3, 3.29),
            ("CRWNFLD PLATKI", 1, 7.99),
            ("KURCZAK FILET KG", 1.106, 23.99),
            ("FREEWAY COLA 2L", 2, 3.49),
            ("BELLAROM KAWA 500", 1, 21.99),
        ],
        "discounts": [
            ("RABAT Lidl Plus", -3.00),
            ("PROMOCJA 2+1 gratis", -3.29),
        ],
    },
    {
        "slug": "zabka-cztery-pozycje",
        "note": "Mały paragon convenience — sprawdza krótkie wydruki.",
        "merchant": "Żabka",
        "header": [
            "ZABKA Z7231",
            "Zabka Polska sp. z o.o.",
            "ul. Dabrowskiego 79A, Poznan",
            "NIP 522-30-40-097",
        ],
        "date": "2026-08-21",
        "time": "08:14",
        "currency": "PLN",
        "payment": "Karta zblizeniowa",
        "items": [
            ("Kawa Zabka Cafe duza", 1, 9.99),
            ("Croissant z czekolada", 1, 5.49),
            ("Woda Zywiec Zdroj 0,5L", 1, 3.29),
            ("Guma Orbit", 1, 4.99),
        ],
        "discounts": [],
    },
    {
        "slug": "orlen-paliwo",
        "note": "Paliwo: jedna pozycja, duża kwota, ilość ułamkowa.",
        "merchant": "Orlen",
        "header": [
            "PKN ORLEN S.A. Stacja 2841",
            "ul. Bukowska 289, Poznan",
            "NIP 774-00-01-454",
        ],
        "date": "2026-08-17",
        "time": "19:03",
        "currency": "PLN",
        "payment": "Karta",
        "items": [
            ("Pb95 EFECTA 95", 43.17, 6.29),
        ],
        "discounts": [],
    },
    {
        "slug": "rossmann-drogeria",
        "note": "Drogeria — kategoryzacja poza spożywką.",
        "merchant": "Rossmann",
        "header": [
            "ROSSMANN SDP sp. z o.o.",
            "Galeria Malta, Poznan",
            "NIP 727-00-17-116",
        ],
        "date": "2026-08-11",
        "time": "15:27",
        "currency": "PLN",
        "payment": "Karta",
        "items": [
            ("Szampon Isana 400ml", 2, 8.99),
            ("Pasta do zebow Elmex", 1, 18.99),
            ("Zel pod prysznic Nivea", 1, 12.49),
            ("Chusteczki Bella 10x", 1, 6.99),
            ("Krem Nivea Soft 200ml", 1, 15.99),
            ("Dezodorant Rexona", 2, 11.49),
        ],
        "discounts": [("ZNIZKA aplikacja Rossmann", -5.00)],
    },
    {
        "slug": "bar-mleczny-lokalny",
        "note": "Sklep spoza sieci — merchant musi wyjść z nagłówka, nie ze słownika.",
        "merchant": "Bar Mleczny Apetyt",
        "header": [
            "BAR MLECZNY APETYT",
            "Anna Kowalska",
            "ul. Wroclawska 12, 61-838 Poznan",
            "NIP 778-12-45-901",
        ],
        "date": "2026-08-19",
        "time": "13:22",
        "currency": "PLN",
        "payment": "Gotowka",
        "items": [
            ("Zupa pomidorowa", 1, 9.00),
            ("Pierogi ruskie 10szt", 1, 18.00),
            ("Kompot", 1, 4.00),
        ],
        "discounts": [],
    },
    {
        "slug": "rewe-eur",
        "note": "Paragon w EUR — test wykrycia waluty i tłumaczenia pozycji.",
        "merchant": "REWE",
        "header": [
            "REWE Markt GmbH",
            "Hauptstrasse 14, 10827 Berlin",
            "USt-IdNr. DE 812 706 034",
        ],
        "date": "2026-07-30",
        "time": "10:51",
        "currency": "EUR",
        "payment": "EC-Karte",
        "labels": {
            "receipt": "KASSENBON",
            "sum": "SUMME EUR",
            "tax": "MwSt",
        },
        "items": [
            ("Vollmilch 3,5% 1L", 2, 1.29),
            ("Roggenbrot 750g", 1, 2.49),
            ("Butter Deutsche Markenbutter", 1, 2.79),
            ("Bananen kg", 0.980, 1.99),
            ("Hähnchenbrustfilet", 0.640, 9.49),
        ],
        "discounts": [],
    },
    {
        "slug": "kaufland-dlugi",
        "note": "20 pozycji — test na ucinanie odpowiedzi modelu.",
        "merchant": "Kaufland",
        "header": [
            "Kaufland Polska Markety",
            "ul. Serbska 7, 61-696 Poznan",
            "NIP 897-16-52-134",
        ],
        "date": "2026-08-02",
        "time": "18:36",
        "currency": "PLN",
        "payment": "Karta",
        "items": [
            ("K-Classic Mleko 2% 1L", 4, 3.29),
            ("Chleb pszenny 600g", 1, 5.49),
            ("Bulki kajzerki 6szt", 1, 4.99),
            ("Ser gouda plastry 150g", 2, 7.49),
            ("Szynka konserwowa 300g", 1, 11.99),
            ("Parowki drobiowe 250g", 2, 6.49),
            ("Makaron swiderki 500g", 2, 3.99),
            ("Ryz basmati 1kg", 1, 12.99),
            ("Olej rzepakowy 1L", 1, 9.49),
            ("Cukier bialy 1kg", 2, 3.79),
            ("Maka pszenna 1kg", 1, 3.49),
            ("Ketchup Pudliszki 480g", 1, 8.99),
            ("Majonez Kielecki 400ml", 1, 9.99),
            ("Ogorki kiszone 900ml", 1, 8.49),
            ("Marchew kg", 1.480, 3.49),
            ("Cebula kg", 0.920, 3.99),
            ("Ziemniaki 2,5kg", 1, 9.99),
            ("Jablka Szampion kg", 2.140, 4.99),
            ("Piwo Tyskie 0,5L", 6, 3.79),
            ("Chipsy Lays 140g", 2, 8.49),
        ],
        "discounts": [],
    },
]


# --- Renderowanie -------------------------------------------------------------

def money(value: float) -> str:
    return f"{value:,.2f}".replace(",", " ").replace(".", ",")


def line_total(qty: float, unit: float) -> float:
    return round(qty * unit + 1e-9, 2)


def qty_str(qty: float) -> str:
    return str(int(qty)) if float(qty).is_integer() else f"{qty:.3f}".replace(".", ",")


def build_lines(receipt: dict) -> tuple[list[tuple[str, str]], dict]:
    """Zwraca listę (styl, tekst) oraz policzoną prawdę o paragonie."""
    labels = receipt.get("labels", {})
    lines: list[tuple[str, str]] = []

    for idx, text in enumerate(receipt["header"]):
        lines.append(("center-bold" if idx == 0 else "center", text))
    lines.append(("gap", ""))
    lines.append(("center", labels.get("receipt", "PARAGON FISKALNY")))
    lines.append(("rule", ""))

    truth_items = []
    subtotal = 0.0
    for name, qty, unit in receipt["items"]:
        total = line_total(qty, unit)
        subtotal += total
        lines.append(("left", name))
        lines.append(("row", f"{qty_str(qty)} x {money(unit)}|{money(total)} A"))
        truth_items.append({
            "name": name,
            "quantity": qty,
            "unitPrice": unit,
            "totalPrice": total,
        })

    discount_total = 0.0
    for label, amount in receipt.get("discounts", []):
        discount_total += amount
        lines.append(("row", f"{label}|{money(amount)}"))

    total = round(subtotal + discount_total, 2)
    lines.append(("rule", ""))
    lines.append(("row-bold", f"{labels.get('sum', 'SUMA ' + receipt['currency'])}|{money(total)}"))
    lines.append(("row", f"{labels.get('tax', 'PTU A 23%')}|{money(round(total * 0.23 / 1.23, 2))}"))
    lines.append(("row", f"{receipt['payment']}|{money(total)}"))
    lines.append(("gap", ""))
    lines.append(("left", f"{receipt['date'].replace('-', '.')} {receipt['time']}   Nr wydr. 4172"))
    lines.append(("center", "DZIEKUJEMY ZA ZAKUPY"))

    truth = {
        "merchant": receipt["merchant"],
        "date": receipt["date"],
        "currency": receipt["currency"],
        "total": total,
        "itemCount": len(truth_items),
        "items": truth_items,
        "discountCount": len(receipt.get("discounts", [])),
        "discountTotal": round(discount_total, 2),
        "note": receipt["note"],
    }
    return lines, truth


def render(receipt: dict, lines: list[tuple[str, str]], seed: int) -> Image.Image:
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    bold = ImageFont.truetype(FONT_PATH, FONT_SIZE, index=1)

    height = MARGIN * 2 + sum(LINE if style != "gap" else LINE // 2 for style, _ in lines)
    paper = Image.new("L", (WIDTH, height), 246)
    draw = ImageDraw.Draw(paper)

    y = MARGIN
    for style, text in lines:
        if style == "gap":
            y += LINE // 2
            continue
        if style == "rule":
            draw.line([(MARGIN, y + LINE // 2), (WIDTH - MARGIN, y + LINE // 2)], fill=120)
            y += LINE
            continue
        use = bold if style.endswith("bold") else font
        if style.startswith("center"):
            width = draw.textlength(text, font=use)
            draw.text(((WIDTH - width) / 2, y), text, font=use, fill=25)
        elif style.startswith("row"):
            left, right = text.split("|")
            draw.text((MARGIN, y), left, font=use, fill=25)
            width = draw.textlength(right, font=use)
            draw.text((WIDTH - MARGIN - width, y), right, font=use, fill=25)
        else:
            draw.text((MARGIN, y), text, font=use, fill=25)
        y += LINE

    return photoize(paper, seed)


def photoize(paper: Image.Image, seed: int) -> Image.Image:
    """Zdjęcie paragonu, nie skan: przekrzywienie, ziarno, winieta, rozmycie."""
    rnd = random.Random(seed)
    img = paper.convert("RGB")

    # Lekka nierównomierność oświetlenia (winieta + gradient).
    w, h = img.size
    shade = Image.new("L", (w, h), 255)
    sd = ImageDraw.Draw(shade)
    for i in range(h):
        sd.line([(0, i), (w, i)], fill=int(255 - 18 * math.sin(math.pi * i / h)))
    img = Image.composite(img, Image.new("RGB", (w, h), (140, 138, 132)), shade)

    img = img.rotate(rnd.uniform(-1.6, 1.6), resample=Image.BICUBIC,
                     expand=True, fillcolor=(120, 118, 112))
    img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.3, 0.7)))
    img = ImageEnhance.Contrast(img).enhance(rnd.uniform(0.86, 0.97))

    # Ziarno matrycy.
    pixels = img.load()
    for _ in range((img.size[0] * img.size[1]) // 9):
        x = rnd.randrange(img.size[0])
        y = rnd.randrange(img.size[1])
        r, g, b = pixels[x, y]
        n = rnd.randint(-16, 16)
        pixels[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))

    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for seed, receipt in enumerate(RECEIPTS, start=1):
        lines, truth = build_lines(receipt)
        image = render(receipt, lines, seed)
        jpg = OUT / f"{receipt['slug']}.jpg"
        image.save(jpg, "JPEG", quality=82, optimize=True)
        (OUT / f"{receipt['slug']}.json").write_text(
            json.dumps(truth, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        index.append({"slug": receipt["slug"], "file": jpg.name, "note": receipt["note"]})
        print(f"{receipt['slug']:28s} {image.size[0]}x{image.size[1]}  "
              f"{jpg.stat().st_size // 1024} KB  suma={truth['total']} {truth['currency']}")

    (OUT / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
