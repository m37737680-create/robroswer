# Traduzioni NPC

Esegui i comandi dalla cartella principale del repository.

Traduci con cache e API locale (`http://127.0.0.1:1234/v1`):

```powershell
.\traduzione\venv\Scripts\python.exe .\traduzione\tradricorsivocodifica.py
```

Ricrea i file tradotti solo dalla cache, senza API:

```powershell
.\traduzione\venv\Scripts\python.exe .\traduzione\tradricorsivocodifica.py --rebuild-from-cache
```

Applica le traduzioni:

```powershell
.\traduzione\venv\Scripts\python.exe .\traduzione\riorganization.py
```

`riorganization.py` sostituisce gli originali con i file tradotti. Fai una copia di sicurezza prima di eseguirlo.