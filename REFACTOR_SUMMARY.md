# MarsanInvest - Refactored Structure

## ✅ Što je učinjeno:

### 1. **HTML (index.html)**
- ✓ Uklonjen sve `style=` atributi 
- ✓ Zamijenjeni CSS klasama (`.hidden`, `.color-*`, `.text-*` itd.)
- ✓ Uklonjen inline `<script>` tag s i18n kodom
- ✓ Čuvan `<style>` tag s CSS varijablama (`:root`)
- ✓ Zadržani svi `data-i18n` atributi za prijevod

### 2. **CSS (style.css)**
- ✓ Dodane sve utility klase:
  - `.hidden { display: none; }`
  - `.ml-05 { margin-left: 0.5rem; }`
  - `.color-* { color: var(--*); }`
  - `.text-bold`, `.text-sm`, `.text-xs`
  - `.text-uppercase`, `.letter-space-08`
  - I mnoge druge...
- ✓ Zadržani svi originalni stilovi
- ✓ Zadržane CSS varijable iz `<style>` taga
- ✓ Dodani novi brand stilovi (plava - `rgb(48, 142, 255)`)

### 3. **JavaScript (script.js)**
- ✓ Sve originalne funkcije zadržane
- ✓ Dodane i18n funkcije:
  - `TRANSLATIONS` objekt (sve jezike)
  - `I18N_MAP` za mapiranje selektora
  - `setLang()` funkcija
  - Load handler za localStorage
- ✓ Sve je u script.js - nema inline skripte

## 📁 Datoteke:

| Datoteka | Redaka | Veličina |
|----------|--------|----------|
| index.html | 3,592 | ~373 KB |
| style.css | 333 | ~7.7 KB |
| script.js | 1,914 | ~85 KB |
| **UKUPNO** | **5,839** | ~465 KB |

## 🎨 Brand Identifikacija Primijenjena:

```css
--primary-blue: rgb(48, 142, 255);    /* Električna plava */
--brand-light: rgb(223, 233, 239);    /* Svjetla siva-bijela */
--brand-gray: rgb(128, 128, 128);     /* Srednja siva */
```

## 🚀 Kako koristiti:

1. **Zamijeni stare datoteke novim:**
   - `index.html` → Tvoj projekt
   - `style.css` → Tvoj projekt
   - `script.js` → Tvoj projekt

2. **Sve bi trebalo raditi bez promjena** jer su svi stilovi i skripte pravilno organizirani.

3. **Za novo dodavanje stilova:**
   - Dodaj u `style.css` (nikad inline!)
   
4. **Za nove skripte:**
   - Dodaj u `script.js` ili worker.js

---

✨ Projekt je sada pravilno strukturiran kao profesionalna web aplikacija!
