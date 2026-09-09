## Config RoBrawser
#### Usando o ````patch```` para mudar os arquivos de forma rápida.

Com o git instalado na sua maquina jogue o arquivo ````0201-config-client.patch```` dentro do diretório ````./roBrowser```` e execute:

````
git apply 0201-config-client.patch
````

#### Mudar os arquivos
````
    app/roBrowser/client/Client.php
    app/roBrowser/client/index.php
    e
    app/roBrowser/client/BGM
    app/roBrowser/client/data
    app/roBrowser/client/resources
````

## As alterações dos arquivos ``client/Client.php`` e ``client/index.php`` pode ser usado o comando ``git apply`` em ``0201-config-client.patch``. 
## Arquivos Client.php
Mude as linhas
````if (file_exists($local_pathEncoded) && !is_dir($local_pathEncoded) && is_readable($local_pathEncoded)) {````
Para
````if (file_exists($local_pathEncoded) && is_readable($local_pathEncoded)) {````
## Arquivos index.php
#### 1º passo
Mude as linhas
````if (empty($_SERVER['REDIRECT_STATUS']) || $_SERVER['REDIRECT_STATUS'] != 404 || empty($_SERVER['REQUEST_URI'])) {````
Para
````if (empty($_SERVER['REDIRECT_STATUS']) || empty($_SERVER['REQUEST_URI'])) {````
#### 2º passo
Mude as linhas
````if (empty($_SERVER['REDIRECT_STATUS']) || $_SERVER['REDIRECT_STATUS'] != 404 || empty($_SERVER['REQUEST_URI'])) {````
Para
````if (empty($_SERVER['REDIRECT_STATUS']) || empty($_SERVER['REQUEST_URI'])) {````
#### 3º passo
REMOVA o bloco de codigo
````
	// Check Allowed directory
	if (!preg_match( '/\/('. $directory . '\/)?(data|BGM)\//', $path)) {
		Debug::write('Forbidden directory, you can just access files located in data and BGM folder.', 'error');
		Debug::output();
	}

````
FICARA VAZIOS
#### 4º passo
app/roBrowser/client/BGM
  - Os arquivos .mp3 do seu serve
app/roBrowser/client/data
  - Adicione a sua pasta ````data```` em ````./data````. 
app/roBrowser/client/resources
  - E em ````resources```` a ````data.grf```` completa com a ````DATA.INI```` configurada.

### Usare i GRF senza esportare tutto in `data`

Il client remoto PHP supporta direttamente i GRF. `client/resources/DATA.INI`
deve elencare i GRF nell'ordine corretto, ad esempio:

```ini
[Data]
1=rdata.grf
2=data.grf
```

Le richieste vengono cercate prima in `client/data` e poi nei GRF. In
`client/configs.php`, mantenere `CLIENT_AUTOEXTRACT` impostato a `false` per
non copiare automaticamente i file dei GRF nella cartella `data`.

Il servizio nginx inoltra le richieste mancanti sotto `/client/` a
`client/index.php`, che esegue la ricerca dentro `DATA.INI` e nei GRF. I file
già presenti in `client/data` possono rimanere come override personalizzati;
non è necessario esportare nuovamente il contenuto completo di `data.grf`.

Per il client RagnarokZero, i file `AI` e `System` necessari come risorse
accessibili sono stati copiati in `client/data`; i file audio sono in
`client/BGM`. DLL, EXE e cartelle specifiche del client Windows non vengono
copiati perché non sono utilizzabili dal client web.
