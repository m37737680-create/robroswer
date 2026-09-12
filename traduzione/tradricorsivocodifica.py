import os
import sys
import re
import json
import time
import signal
import argparse
import requests
from bs4 import BeautifulSoup
from html import unescape

# Configura l'output da console su UTF-8 (previene crash su Windows cp1252 con caratteri speciali ed emoji)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURAZIONE PREDEFINITA ---
DEFAULT_NPC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "npc")
DEFAULT_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "translation_cache.json")
DEFAULT_REQUEST_DELAY = 0.15   # Ritardo tra richieste web reali (in secondi)
OVERWRITE_EXISTING = False     # Se False, salta i file -ita.txt già completati per consentire la ripresa


class RobustROTranslator:
    def __init__(self, cache_file=DEFAULT_CACHE_FILE, delay=DEFAULT_REQUEST_DELAY, source_lang='en', target_lang='it'):
        self.cache_file = cache_file
        self.delay = delay
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.cache = {}
        self.dirty_cache_count = 0
        
        # Statistiche di sessione
        self.stats = {
            'translated_phrases': 0,
            'cache_hits': 0,
            'api_calls': 0,
            'files_processed': 0,
            'files_skipped': 0,
        }

        # Sessione HTTP persistente con User-Agent reale per evitare blocchi Google Translate
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': f'{self.target_lang},{self.source_lang};q=0.9',
        })

        self.load_cache()

    def load_cache(self):
        if self.cache_file and os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
                print(f"📦 Cache caricata con successo: {len(self.cache)} frasi pronte.")
            except Exception as e:
                print(f"⚠️ Errore caricamento cache da {self.cache_file}: {e}")
                self.cache = {}

    def save_cache(self, force=False):
        if self.cache_file and (self.dirty_cache_count > 0 or force):
            try:
                temp_file = self.cache_file + ".tmp"
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(self.cache, f, ensure_ascii=False, indent=1)
                if os.path.exists(self.cache_file):
                    os.replace(temp_file, self.cache_file)
                else:
                    os.rename(temp_file, self.cache_file)
                self.dirty_cache_count = 0
            except Exception as e:
                print(f"⚠️ Errore salvataggio cache: {e}")

    def raw_translate(self, text):
        """Traduce una singola frase con cache su disco e retry esponenziale."""
        if not text or not text.strip():
            return text

        # Controllo rapido in cache
        if text in self.cache:
            self.stats['cache_hits'] += 1
            return self.cache[text]

        self.stats['api_calls'] += 1
        for attempt in range(3):
            try:
                if self.delay > 0:
                    time.sleep(self.delay)

                params = {'tl': self.target_lang, 'sl': self.source_lang, 'q': text}
                response = self.session.get('https://translate.google.com/m', params=params, timeout=12)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    el = soup.find('div', class_='result-container')
                    if el:
                        translated = unescape(el.get_text(strip=True))
                        self.cache[text] = translated
                        self.dirty_cache_count += 1
                        self.stats['translated_phrases'] += 1

                        # Salva la cache su disco ogni 25 nuove traduzioni
                        if self.dirty_cache_count >= 25:
                            self.save_cache()
                        return translated

                elif response.status_code == 429:
                    wait_sec = (attempt + 1) * 4
                    print(f"⏳ Rate limit Google (429), pausa di {wait_sec}s...")
                    time.sleep(wait_sec)
                    continue

            except Exception as e:
                wait_sec = (attempt + 1) * 2
                print(f"⚠️ Tentativo {attempt + 1}/3 fallito per '{text[:25]}...': {e}")
                time.sleep(wait_sec)

        # In caso di insuccesso dopo i tentativi, ritorna il testo originale intatto
        return text

    def translate_string_content(self, text):
        """
        Protegge caratteri speciali, colori ^RRGGBB, coordinate e link di Ragnarok
        prima di inviare a Google Translate, poi ripristina tutto fedelmente.
        """
        if not text or not text.strip():
            return text

        # Se non ci sono lettere alfabetiche (es. solo separatori, punteggiatura o numeri), non toccare
        if not re.search(r'[A-Za-zÀ-ÿ]', text):
            return text

        # Preserva gli spazi iniziali e finali per le concatenazioni di stringhe ("Hello " + strcharinfo)
        m_lead = re.match(r'^\s*', text)
        m_trail = re.search(r'\s*$', text)
        lead_ws = m_lead.group(0) if m_lead else ""
        trail_ws = m_trail.group(0) if m_trail else ""
        core = text[len(lead_ws):len(text) - len(trail_ws)]

        if not core or not re.search(r'[A-Za-zÀ-ÿ]', core):
            return text

        # Protezione elementi speciali rAthena:
        # 1. <INFO>...</INFO> (coordinate navigazione)
        # 2. Tag <NAVI>, </NAVI>, <ITEM>, </ITEM>, <URL>, </URL>
        # 3. Codici colore ^RRGGBB (es. ^FF0000, ^000000)
        # 4. Slot oggetti tra quadre: es. [3]
        # 5. Caratteri di escape rAthena: \n, \t, \"
        placeholders = []
        def repl_ph(match):
            placeholders.append(match.group(0))
            return f"__{len(placeholders) - 1}__"

        protected = re.sub(
            r'<INFO>.*?</INFO>|</?(?:NAVI|ITEM|URL)>|\^[0-9A-Fa-f]{6}|\[\d+\]|\\[nt"]',
            repl_ph,
            core
        )

        translated = self.raw_translate(protected)
        if not translated:
            return text

        # Ripristino dei segnaposto (robusto contro spazi aggiunti dal traduttore)
        def restore_ph(match):
            idx = int(match.group(1))
            if 0 <= idx < len(placeholders):
                return placeholders[idx]
            return match.group(0)

        restored = re.sub(r'__\s*(\d+)\s*__', restore_ph, translated)

        # Regola critica: le virgolette doppie dentro i dialoghi devono diventare apici singoli
        # per non causare errori di sintassi nei file di script rAthena
        restored = restored.replace('"', "'")

        return lead_ws + restored + trail_ws

    def translate_options_string(self, text):
        """Traduce opzioni di menu separate da due punti ':' (es. 'Save:Cancel')."""
        if ':' in text:
            parts = text.split(':')
            translated_parts = [self.translate_string_content(p) if p.strip() else p for p in parts]
            return ':'.join(translated_parts)
        else:
            return self.translate_string_content(text)

    def find_matching_paren(self, text, open_paren_pos):
        """Trova la parentesi tonda di chiusura corretta, ignorando quelle racchiuse tra virgolette."""
        depth = 0
        in_quote = False
        escape = False
        for i in range(open_paren_pos, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == '\\' and in_quote:
                escape = True
                continue
            if ch == '"':
                in_quote = not in_quote
                continue
            if not in_quote:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        return i
        return -1

    def process_line(self, line, state):
        """Analizza e traduce una singola riga di script secondo la sintassi rAthena."""
        stripped = line.strip()

        # Salta righe vuote e commenti puri
        if not stripped or stripped.startswith('//'):
            return line

        # Stato menu multiriga (continua a tradurre opzioni finché non trova ';')
        if state.get('in_menu'):
            def repl_menu_quote(m):
                content = m.group(1)
                trans = self.translate_string_content(content)
                return f'"{trans}"'
            line = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_menu_quote, line)
            if ';' in line:
                state['in_menu'] = False
            return line

        # 1. Comando mes <espressione>;
        mes_match = re.search(r'(?:^|[\s;{}])mes\s+(["\'].*);', line)
        if mes_match:
            expr = mes_match.group(1)
            def repl_mes_quote(m):
                content = m.group(1)
                trans = self.translate_string_content(content)
                return f'"{trans}"'
            new_expr = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_mes_quote, expr)
            return line[:mes_match.start(1)] + new_expr + line[mes_match.end(1):]

        # 2. Comandi select(...) e prompt(...)
        sel_match = re.search(r'\b(select|prompt)\s*\(', line)
        if sel_match:
            open_p = line.find('(', sel_match.start())
            close_p = self.find_matching_paren(line, open_p)
            if close_p != -1:
                args_str = line[open_p + 1:close_p]
                def repl_sel_quote(m):
                    content = m.group(1)
                    trans = self.translate_options_string(content)
                    return f'"{trans}"'
                new_args = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_sel_quote, args_str)
                line = line[:open_p + 1] + new_args + line[close_p:]
                return line

        # 3. Comando npctalk <messaggio> {, <nome_npc>, ...};
        # Traduce SOLO il primo parametro (messaggio), preservando ID o nome dell'NPC nel secondo parametro
        npctalk_match = re.search(r'(?:^|[\s;{}])npctalk\s+(["\'].*?)(?:,\s*.*?)?;', line)
        if npctalk_match:
            first_quote = re.search(r'"((?:[^"\\]|\\.)*)"', npctalk_match.group(1))
            if first_quote:
                trans = self.translate_string_content(first_quote.group(1))
                new_first_arg = npctalk_match.group(1)[:first_quote.start()] + f'"{trans}"' + npctalk_match.group(1)[first_quote.end():]
                return line[:npctalk_match.start(1)] + new_first_arg + line[npctalk_match.end(1):]

        # 4. Comando dispbottom <messaggio> {, <colore>};
        disp_match = re.search(r'(?:^|[\s;{}])dispbottom\s+(.+?)(?:,\s*[^,]+)?;', line)
        if disp_match:
            expr = disp_match.group(1)
            def repl_disp_quote(m):
                content = m.group(1)
                trans = self.translate_string_content(content)
                return f'"{trans}"'
            new_expr = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_disp_quote, expr)
            return line[:disp_match.start(1)] + new_expr + line[disp_match.end(1):]

        # 5. Comando showscript <messaggio> {, <npcid>};
        show_match = re.search(r'(?:^|[\s;{}])showscript\s+(.+?)(?:,\s*.*?)?;', line)
        if show_match:
            expr = show_match.group(1)
            def repl_show_quote(m):
                content = m.group(1)
                trans = self.translate_string_content(content)
                return f'"{trans}"'
            new_expr = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_show_quote, expr)
            return line[:show_match.start(1)] + new_expr + line[show_match.end(1):]

        # 6. Comando menu "Opzione 1", Label1, "Opzione 2", Label2;
        if re.search(r'(?:^|[\s;{}])menu\s+"', line):
            def repl_menu_quote(m):
                content = m.group(1)
                trans = self.translate_string_content(content)
                return f'"{trans}"'
            new_line = re.sub(r'"((?:[^"\\]|\\.)*)"', repl_menu_quote, line)
            if ';' not in line:
                state['in_menu'] = True
            return new_line

        # 7. Assegnazione variabili menu: .@menu$ = "..." oppure .@menu$ += "..."
        if re.search(r'\.@menu\$\s*(\+?=)\s*', line):
            def repl_menustr_quote(m):
                content = m.group(1)
                trans = self.translate_options_string(content)
                return f'"{trans}"'
            return re.sub(r'"((?:[^"\\]|\\.)*)"', repl_menustr_quote, line)

        # 8. Comando announce "<messaggio>", flag...
        ann_match = re.search(r'(?:^|[\s;{}])announce\s+"((?:[^"\\]|\\.)*)"', line)
        if ann_match:
            trans = self.translate_string_content(ann_match.group(1))
            return line[:ann_match.start(1)] + f'"{trans}"' + line[ann_match.end(1) + 1:]

        # 9. Comando mapannounce "<mappa>", "<messaggio>", flag...
        # Mantiene la mappa intatta nel primo parametro e traduce il messaggio nel secondo
        mapann_match = re.search(r'(?:^|[\s;{}])mapannounce\s+"(?:[^"\\]|\\.)*"\s*,\s*"((?:[^"\\]|\\.)*)"', line)
        if mapann_match:
            trans = self.translate_string_content(mapann_match.group(1))
            return line[:mapann_match.start(1)] + f'"{trans}"' + line[mapann_match.end(1) + 1:]

        return line

    def translate_file(self, file_path, output_path):
        lines = None
        for enc in ['utf-8', 'latin-1', 'cp1252']:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    lines = f.readlines()
                break
            except UnicodeDecodeError:
                continue
            except Exception as e:
                print(f"❌ Errore apertura {file_path}: {e}")
                return False

        if lines is None:
            print(f"❌ Impossibile leggere {file_path}")
            return False

        state = {'in_menu': False}
        out_lines = []
        mod_count = 0

        for line in lines:
            new_line = self.process_line(line, state)
            if new_line != line:
                mod_count += 1
            out_lines.append(new_line)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.writelines(out_lines)

        self.save_cache()
        self.stats['files_processed'] += 1
        return mod_count


def translate_all_txt(root_directory, translator, overwrite=OVERWRITE_EXISTING):
    """Scansiona e traduce ricorsivamente tutti i file .txt della cartella npc."""
    if not os.path.exists(root_directory):
        print(f"❌ Cartella non trovata: {root_directory}")
        return

    # Raccogli tutti i file .txt originali (escludendo i già tradotti -ita.txt)
    target_files = []
    for dirpath, _, filenames in os.walk(root_directory):
        for filename in filenames:
            if filename.endswith(".txt") and not filename.endswith("-ita.txt"):
                file_path = os.path.join(dirpath, filename)
                output_path = os.path.join(dirpath, filename[:-4] + "-ita.txt")
                target_files.append((file_path, output_path, filename))

    total_files = len(target_files)
    print(f"\n📂 Trovati {total_files} file .txt da analizzare in '{root_directory}'.\n")

    start_time = time.time()

    for idx, (file_path, output_path, filename) in enumerate(target_files, 1):
        # Ripresa automatica: salta i file già tradotti se non è richiesto l'overwrite
        if not overwrite and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            translator.stats['files_skipped'] += 1
            continue

        rel_path = os.path.relpath(file_path, root_directory)
        print(f"[{idx}/{total_files}] 🔄 Elaborazione: {rel_path}...")

        mod_lines = translator.translate_file(file_path, output_path)
        if mod_lines is not False:
            print(f"       ✅ Salvato ({mod_lines} righe tradotte) -> {os.path.basename(output_path)}")

    elapsed = time.time() - start_time
    translator.save_cache(force=True)

    print("\n" + "=" * 60)
    print("🎉 TRADUZIONE COMPLETATA!")
    print(f"⏱️ Tempo totale impiegato: {elapsed:.1f} secondi")
    print(f"📁 File elaborati: {translator.stats['files_processed']}")
    print(f"⏩ File saltati (già completati): {translator.stats['files_skipped']}")
    print(f"💬 Frasi tradotte ex-novo: {translator.stats['translated_phrases']}")
    print(f"⚡ Frasi riutilizzate dalla cache: {translator.stats['cache_hits']}")
    print(f"🌐 Chiamate di rete a Google: {translator.stats['api_calls']}")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Traduttore ricorsivo rAthena NPC per RoBrowser (Inglese -> Italiano)")
    parser.add_argument('path', nargs='?', default=DEFAULT_NPC_DIR, help="Cartella NPC o singolo file .txt da tradurre")
    parser.add_argument('--force', action='store_true', help="Ritraduce e sovrascrive anche i file -ita.txt già esistenti")
    parser.add_argument('--delay', type=float, default=DEFAULT_REQUEST_DELAY, help="Ritardo tra chiamate di rete in secondi (default: 0.15)")
    parser.add_argument('--cache', default=DEFAULT_CACHE_FILE, help="Percorso del file di cache JSON")
    args = parser.parse_args()

    translator = RobustROTranslator(cache_file=args.cache, delay=args.delay)

    # Gestione chiusura pulita (Ctrl+C o SIGINT): salva sempre la cache su disco
    def handle_interrupt(sig, frame):
        print("\n\n⚠️ Interruzione rilevata! Salvataggio cache in corso...")
        translator.save_cache(force=True)
        print("💾 Cache salvata con successo. Puoi riprendere in qualsiasi momento.")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_interrupt)

    target_path = os.path.abspath(args.path)

    if os.path.isfile(target_path):
        # Traduzione di un singolo file
        output_path = target_path[:-4] + "-ita.txt" if target_path.endswith(".txt") else target_path + "-ita.txt"
        print(f"📄 Traduzione singolo file: {target_path} -> {output_path}")
        translator.translate_file(target_path, output_path)
        translator.save_cache(force=True)
    elif os.path.isdir(target_path):
        # Scansione ricorsiva della directory
        translate_all_txt(target_path, translator, overwrite=args.force)
    else:
        print(f"❌ Percorso non valido: {target_path}")


if __name__ == "__main__":
    main()
