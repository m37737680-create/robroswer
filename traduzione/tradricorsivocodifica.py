import os
import re
from deep_translator import GoogleTranslator, exceptions

# Funzione per tradurre il testo e gestire le virgolette interne solo nei 'mes'
def translate_text(text, is_mes=False):
    if not text.strip():
        return text
    try:
        translated = GoogleTranslator(source='en', target='it').translate(text)

        # Se la traduzione ha restituito None, usa il testo originale
        if translated is None:
            print(f"❌ Traduzione non trovata per: {text}")
            return text
        
        # Se è un 'mes', sostituisci le doppie virgolette interne con singole
        if is_mes and '"' in translated:
            translated = translated.replace('"', "'")
        
        return translated
    except exceptions.TranslationNotFound:
        print(f"❌ Impossibile tradurre: {text}")
        return text  # Se la traduzione fallisce, restituisce il testo originale

# Funzione per leggere il file con più codifiche
def read_file_with_encoding(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.readlines()
    except UnicodeDecodeError:
        print(f"⚠️ Problema con UTF-8: {file_path}. Riprovo con Latin-1...")
        try:
            with open(file_path, 'r', encoding='latin-1') as file:
                return file.readlines()
        except Exception as e:
            print(f"❌ Errore con Latin-1 su {file_path}: {e}")
            return None  # Se fallisce anche con Latin-1, restituisce None

# Funzione per tradurre un singolo file
def translate_script(file_path, output_path):
    script_lines = read_file_with_encoding(file_path)
    if script_lines is None:
        return  # Se il file non può essere letto, evita di tradurlo

    with open(output_path, "w", encoding="utf-8") as file:
        for line in script_lines:
            # Traduzione per 'mes "..."'
            match_mes = re.search(r'mes\s+"([^"]+)"', line)
            if match_mes and match_mes.group(1):
                original_text = match_mes.group(1)
                translated_text = translate_text(original_text, is_mes=True)
                line = line.replace(original_text, translated_text)
                print(f"🔹 Tradotto [mes]: {original_text} -> {translated_text}")

            # Traduzione per 'npctalk "..."'
            match_npctalk = re.search(r'npctalk\s+"([^"]+)"', line)
            if match_npctalk and match_npctalk.group(1):
                original_text = match_npctalk.group(1)
                translated_text = translate_text(original_text)
                line = line.replace(original_text, translated_text)
                print(f"🔹 Tradotto [npctalk]: {original_text} -> {translated_text}")

            # Traduzione per 'select("...", "...", "...")'
            match_select = re.search(r'select\s*\(\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\s*\)', line)
            if match_select:
                original_options = [opt for opt in match_select.groups() if opt]
                translated_options = [translate_text(opt) for opt in original_options]
                translated_line = line.replace(match_select.group(0),
                                               f'select("{translated_options[0]}"' +
                                               (f', "{translated_options[1]}"' if len(translated_options) > 1 else '') +
                                               (f', "{translated_options[2]}"' if len(translated_options) > 2 else '') + ")")
                line = translated_line
                print(f"🔹 Tradotto [select]: {match_select.group(0)} -> {translated_line}")

            # Traduzione di stringhe tra parentesi ("...", "...", "...")
            match_parentheses = re.search(r'\(\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\s*\)', line)
            if match_parentheses:
                translated_items = [translate_text(item) for item in match_parentheses.groups() if item]
                translated_line = line.replace(match_parentheses.group(0),
                                               f'("{translated_items[0]}"' +
                                               (f', "{translated_items[1]}"' if len(translated_items) > 1 else '') +
                                               (f', "{translated_items[2]}"' if len(translated_items) > 2 else '') +
                                               (f', "{translated_items[3]}"' if len(translated_items) > 3 else '') + ")")
                line = translated_line
                print(f"🔹 Tradotto [parentheses]: {match_parentheses.group(0)} -> {translated_line}")

            # Scrive la riga tradotta immediatamente nel file per evitare perdite di dati
            file.write(line + "\n")

    print(f"\n✅ Traduzione completata. File salvato come '{output_path}'.")

# Funzione per tradurre tutti i file .txt ricorsivamente nelle cartelle
def translate_all_txt(root_directory):
    for dirpath, _, filenames in os.walk(root_directory):
        for filename in filenames:
            if filename.endswith(".txt"):
                file_path = os.path.join(dirpath, filename)
                output_path = os.path.join(dirpath, filename.replace(".txt", "-ita.txt"))

                print(f"\n🔄 Traduzione in corso: {file_path} -> {output_path}")
                translate_script(file_path, output_path)

# Esempio di utilizzo: cambia 'C:\\Users\\User\\Desktop\\ragnarok guida' con la tua cartella
root_directory = r"C:\il\tuo\Desktop\ragnarokserver\"
translate_all_txt(root_directory)
