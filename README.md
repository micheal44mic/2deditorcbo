# Editor 2D CBOs

## Test locale e mobile

Usare questo indirizzo per provare l'app anche da telefono sulla stessa rete:

```text
http://192.168.0.38:8000/
```

Il server statico deve servire la root di questo progetto sulla porta `8000`.
Comando consigliato:

```powershell
py -m http.server 8000 --bind 0.0.0.0
```

Nota per Codex: quando bisogna far provare modifiche su mobile, verificare e usare
`http://192.168.0.38:8000/` invece di `localhost` o altre porte temporanee.
