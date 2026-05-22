# Editor 2D CBOs

## Mappa progetto

La mappa ufficiale per orientarsi nella codebase e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Prima di modifiche grandi conviene partire da li: contiene boot flow, file principali,
test mirati e note sui punti delicati.

## Comandi standard

Non serve installare dipendenze npm per i test attuali.

```powershell
npm test
```

Eseguire un test singolo:

```powershell
npm run test:one -- tests/area-selection-tool.test.js
```

Avviare il server statico sulla porta `8000`:

```powershell
npm start
```

## Test locale e mobile

Usare questo indirizzo per provare l'app anche da telefono sulla stessa rete:

```text
http://192.168.0.38:8000/
```

Il server statico deve servire la root di questo progetto sulla porta `8000`.
Comando diretto equivalente:

```powershell
py -m http.server 8000 --bind 0.0.0.0
```

Nota per Codex: quando bisogna far provare modifiche su mobile, verificare e usare
`http://192.168.0.38:8000/` invece di `localhost` o altre porte temporanee.
