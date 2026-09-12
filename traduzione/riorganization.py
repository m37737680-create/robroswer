import os
import re

def clean_and_rename_translation_files(root_directory):
    """
    Attraversa ricorsivamente la directory, elimina i file sorgenti (senza -ita)
    e rinomina i file tradotti (-ita.txt) sul nome originale (.txt).
    """
    print("=========================================================")
    print("!!! AVVISO: QUESTO SCRIPT È DESTRUTTIVO !!!")
    print("Eliminerà i file originali NON TRADOTTI.")
    print("=========================================================")
    
    success_count = 0
    failure_count = 0
    
    # Utilizza os.walk per attraversare tutte le sottocartelle
    for dirpath, _, filenames in os.walk(root_directory):
        print(f"\n🔎 Scansione della cartella: {dirpath}")
        
        for filename in filenames:
            
            # Controlliamo solo i file tradotti
            if filename.endswith("-ita.txt"):
                
                translated_filename = filename
                # Determina il nome originale atteso (es. izlude.txt)
                original_filename = filename.replace("-ita.txt", ".txt")
                
                # Percorsi completi
                translated_path = os.path.join(dirpath, translated_filename)
                original_path = os.path.join(dirpath, original_filename)
                
                print(f"\n  [Analisi] Trovato: {translated_filename}")
                
                # 1. VERIFICA SE ESISTE IL FILE ORIGINALE DA CANCELARE
                if os.path.exists(original_path):
                    print(f"  🔥 FILE ORIGINALE TROVATO: {original_filename}")
                    
                    # 2. CANCELLAZIONE DEL FILE ORIGINALE (AZIONE DESTRUTTIVA)
                    try:
                        os.remove(original_path)
                        print(f"  ✅ Cancellazione riuscita: {original_filename}")
                    except Exception as e:
                        print(f"  ❌ ERRORE GRAVISSIMO durante la cancellazione di {original_filename}: {e}")
                        failure_count += 1
                        continue # Salta alla prossima iterazione se la cancellazione fallisce
                else:
                    print(f"  ⚠️ Avviso: Nessun file originale ({original_filename}) trovato da cancellare.")
                
                # 3. RINOMINA DEL FILE TRADOTTO
                try:
                    # Rinomina izlude-ita.txt -> izlude.txt
                    os.rename(translated_path, original_path)
                    print(f"  ✅ Rinomina riuscita: {translated_filename} -> {original_filename}")
                    success_count += 1
                except Exception as e:
                    print(f"  ❌ ERRORE durante la rinomina di {translated_filename}: {e}")
                    failure_count += 1


    print("\n=========================================================")
    print("🎉 Riorganizzazione COMPLETATA (ATTENZIONE AI LOGS)!")
    print(f"Operazioni di successo (Cancellazione + Rinomina): {success_count}")
    print(f"Operazioni fallite: {failure_count}")
    print("=========================================================")


# --- Configurazione ---
import sys
DEFAULT_ROOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "npc")

# Esecuzione dello script
if __name__ == "__main__":
    root_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ROOT_DIR
    # Verifica che la cartella esista
    if not os.path.exists(root_dir):
        print(f"FATAL ERROR: La directory specificata non esiste: {root_dir}")
    else:
        clean_and_rename_translation_files(root_dir)
