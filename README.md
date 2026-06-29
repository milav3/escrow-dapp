# 🛡️ Decentralizovana Escrow Aplikacija sa Arbitražom (DApp)

Ovaj projekat predstavlja decentralizovanu aplikaciju (DApp) koja implementira **uslovni escrow ugovor** (deponovanje sredstava kod posrednika) između kupca i prodavca, uz uključivanje treće strane (arbitra) za rešavanje eventualnih sporova. Projekat je razvijen u okviru predmeta **Kriptografija**.

Fokus projekta je na uslovnom oslobađanju sredstava i razrešavanju sporova bez potrebe za uzajamnim poverenjem strana (*trustless* okruženje), gde blockchain garantuje pravičnost i bezbednost.

---

## 🚀 Ključne Komponente

1. **Pametni Ugovor (Solidity):** Implementira escrow logiku, upravlja stanjima ugovora, kontroliše uloge i bezbedno zaključava sredstva na blockchainu.
2. **Web3 / Front-end (React + Vite):** Korisnički interfejs koji omogućava kreiranje, pregled i interakciju sa escrow ugovorima uživo na mreži.
3. **Integracija (ethers.js + MetaMask):** Povezivanje frontenda sa blockchainom, autentifikacija korisnika i potpisivanje transakcija.
4. **Testni Okvir (JavaScript/Hardhat):** Automatizovani unit testovi koji pokrivaju sve ključne scenarije i granične slučajeve.

---

## 📑 Detalji Pametnog Ugovora

Svaki kreirani escrow sadrži sledeće podatke o poslu:
* `buyer` (Kupac) - Adresa koja finansira ugovor.
* `seller` (Prodavac) - Adresa koja pruža uslugu/robu i prima isplatu.
* `arbiter` (Arbitar) - Nezavisna adresa zadužena za presudu u slučaju spora.
* `amount` - Količina Ethera zaključana u ugovoru.
* `state` - Trenutni status posla kroz sledeći državni automat (*State Machine*):
  * `CREATED` (0) - Ugovor je napravljen, čeka se uplata kupca.
  * `FUNDED` (1) - Kupac je uspešno deponovao sredstva.
  * `RELEASED` (2) - Sredstva su uspešno prosleđena prodavcu.
  * `REFUNDED` (3) - Sredstva su vraćena kupcu od strane prodavca.
  * `DISPUTED` (4) - Pokrenut je spor oko realizacije posla.
  * `RESOLVED` (5) - Arbitar je doneo konačnu odluku i raspodelio sredstva.

### 🔄 Podržani Ishodi (Faze i Tokovi)
* **Ishod 1 (Uspešna realizacija):** Kupac nakon uplate potvrđuje prijem robe/usluge (`confirmDelivery`), čime se sredstva direktno oslobađaju i šalju prodavcu.
* **Ishod 2 (Samoinicijativni povraćaj):** Prodavac u stanju `FUNDED` može samostalno odlučiti da vrati sredstva kupcu (`refundBuyer`) ukoliko ne može da ispuni obavezu.
* **Ishod 3 (Arbitraža):** Kupac može pokrenuti spor (`raiseDispute`), nakon čega pravo glasa dobija isključivo arbitar koji donosi konačnu odluku (`resolveDispute`) u korist kupca ili prodavca.

---

## 🔒 Bezbednosni i Kriptografski Zahtevi

* **Autentifikacija i ECDSA potpisi:** Svaka akcija na aplikaciji mora biti digitalno potpisana privatnim ključem korisnika preko MetaMask novčanika. Kontrola pristupa je strogo definisana modifikatorima (npr. samo kupac može potvrditi dostavu, samo arbitar može presuditi).
* **Reentrancy Zaštita:** Sve funkcije koje vrše transfer Ethera koriste `noReentrancy` zaštitu kako bi se sprečili napadi višestrukog podizanja sredstava pre izmene stanja.
* **Sprečavanje dvostrukog oslobađanja:** Svaka promena stanja vrši se pre samog transfera sredstava (*Checks-Effects-Interactions* obrazac).
* **Revizorski trag (Events):** Ugovor emituje specifične događaje (`emit`) za svaku promenu stanja (`EscrowCreated`, `EscrowFunded`, `FundsReleased`, `DisputeRaised`, `DisputeResolved`) koji sadrže vremenske oznake (`block.timestamp`), što omogućava punu javnu proverljivost.

---

## 🛠️ Tehnološki Stak

* **Pametni ugovor:** Solidity ^0.8.0
* **Frontend:** React, Vite
* **Blockchain interakcija:** Ethers.js (v5)
* **Novčanik:** MetaMask
* **Mreža za Deployment:** Ethereum Sepolia Testnet
* **Testiranje:** JavaScript (Hardhat / Chai / Waffle)

---

## 💻 Pokretanje Projekta

### 1. Kloniranje i Instalacija
Završi instalaciju svih potrebnih paketa unutar projekta:
```bash
npm install